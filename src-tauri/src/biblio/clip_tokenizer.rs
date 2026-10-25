// Découpage du texte pour le modèle de texte CLIP : même méthode que celle d'OpenAI (BPE sur les octets).
// Le vocabulaire et les règles de fusion viennent du fichier tokenizer.json téléchargé avec le modèle.

use regex::Regex;
use std::collections::HashMap;

const START: &str = "<|startoftext|>";
const END: &str = "<|endoftext|>";
/// Longueur fixe attendue par le modèle.
pub const CONTEXT: usize = 77;

pub struct ClipTokenizer {
    vocab: HashMap<String, u32>,
    ranks: HashMap<(String, String), usize>,
    byte_to_char: [char; 256],
    pattern: Regex,
    start: u32,
    end: u32,
}

/// Les 256 octets représentés par des caractères visibles (table d'OpenAI « bytes_to_unicode »).
fn byte_table() -> [char; 256] {
    let mut keep: Vec<u32> = (b'!' as u32..=b'~' as u32).collect();
    keep.extend(0xA1..=0xAC);
    keep.extend(0xAE..=0xFF);
    let mut table = ['\0'; 256];
    let mut extra = 0u32;
    for b in 0u32..256 {
        table[b as usize] = if keep.contains(&b) {
            char::from_u32(b).unwrap()
        } else {
            let c = char::from_u32(256 + extra).unwrap();
            extra += 1;
            c
        };
    }
    table
}

impl ClipTokenizer {
    /// Construit le découpeur depuis le contenu de tokenizer.json.
    pub fn from_json(json: &str) -> Result<Self, String> {
        let root: serde_json::Value = serde_json::from_str(json).map_err(|e| format!("tokenizer.json illisible : {e}"))?;
        let model = &root["model"];
        let vocab: HashMap<String, u32> = model["vocab"]
            .as_object()
            .ok_or("vocabulaire absent")?
            .iter()
            .filter_map(|(k, v)| v.as_u64().map(|id| (k.clone(), id as u32)))
            .collect();
        let merges = model["merges"].as_array().ok_or("règles de fusion absentes")?;
        let mut ranks = HashMap::new();
        for (rank, m) in merges.iter().enumerate() {
            let pair = match m {
                serde_json::Value::String(s) => s.split_once(' ').map(|(a, b)| (a.to_string(), b.to_string())),
                serde_json::Value::Array(a) if a.len() == 2 => Some((a[0].as_str().unwrap_or("").to_string(), a[1].as_str().unwrap_or("").to_string())),
                _ => None,
            };
            if let Some(p) = pair {
                ranks.insert(p, rank);
            }
        }
        let start = *vocab.get(START).ok_or("symbole de début absent")?;
        let end = *vocab.get(END).ok_or("symbole de fin absent")?;
        let pattern = Regex::new(r"(?i)<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]|[^\s\p{L}\p{N}]+").map_err(|e| e.to_string())?;
        Ok(Self { vocab, ranks, byte_to_char: byte_table(), pattern, start, end })
    }

    /// Fusionne les paires de lettres selon les règles, comme le fait CLIP.
    fn bpe(&self, token: &str) -> Vec<String> {
        let mut word: Vec<String> = token.chars().map(|c| c.to_string()).collect();
        if let Some(last) = word.last_mut() {
            last.push_str("</w>");
        }
        while word.len() > 1 {
            let best = (0..word.len() - 1)
                .filter_map(|i| self.ranks.get(&(word[i].clone(), word[i + 1].clone())).map(|r| (*r, i)))
                .min();
            let Some((_, i)) = best else { break };
            let merged = format!("{}{}", word[i], word[i + 1]);
            word.splice(i..i + 2, [merged]);
        }
        word
    }

    /// Les numéros de morceaux d'un texte : début, texte, fin. Complété à `CONTEXT` avec le symbole de fin ; tronqué si trop long.
    pub fn encode(&self, text: &str) -> Vec<i64> {
        let cleaned = text.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase();
        let mut ids: Vec<i64> = vec![self.start as i64];
        for m in self.pattern.find_iter(&cleaned) {
            let piece = m.as_str();
            let bytes: String = piece.bytes().map(|b| self.byte_to_char[b as usize]).collect();
            for part in self.bpe(&bytes) {
                if let Some(id) = self.vocab.get(&part) {
                    ids.push(*id as i64);
                }
            }
        }
        ids.truncate(CONTEXT - 1);
        ids.push(self.end as i64);
        let content = ids.len();
        ids.resize(CONTEXT, self.end as i64);
        debug_assert!(content <= CONTEXT);
        ids
    }

    /// Nombre de vrais morceaux (début et fin compris), pour le masque d'attention.
    pub fn content_len(ids: &[i64], end: i64) -> usize {
        ids.iter().position(|&x| x == end).map(|p| p + 1).unwrap_or(ids.len())
    }

    pub fn end_id(&self) -> i64 {
        self.end as i64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Petit vocabulaire de test : « a », « cat » et leurs formes de fin de mot.
    fn tiny() -> ClipTokenizer {
        let json = r#"{"model":{"vocab":{"<|startoftext|>":10,"<|endoftext|>":11,"a</w>":1,"c":2,"a":3,"t</w>":4,"ca":5,"cat</w>":6,"!</w>":7},"merges":["c a","ca t</w>","a t</w>"]}}"#;
        ClipTokenizer::from_json(json).unwrap()
    }

    #[test]
    fn byte_table_is_a_bijection_on_visible_chars() {
        let t = byte_table();
        assert_eq!(t[b'a' as usize], 'a');
        assert_eq!(t[b' ' as usize], '\u{120}'); // l'espace devient « Ġ »
        let mut seen: Vec<char> = t.to_vec();
        seen.sort();
        seen.dedup();
        assert_eq!(seen.len(), 256);
    }

    #[test]
    fn encodes_start_words_end_and_pads_with_end() {
        let ids = tiny().encode("A  cat");
        assert_eq!(&ids[..4], &[10, 1, 6, 11]);
        assert_eq!(ids.len(), CONTEXT);
        assert!(ids[4..].iter().all(|&x| x == 11));
    }

    #[test]
    fn merges_follow_the_lowest_rank_first() {
        // « cat » : c+a (rang 0) puis ca+t</w> (rang 1) → un seul morceau
        let tk = tiny();
        assert_eq!(tk.bpe("cat"), vec!["cat</w>".to_string()]);
    }

    #[test]
    fn punctuation_is_its_own_word_and_unknown_pieces_are_skipped() {
        let ids = tiny().encode("cat!");
        assert_eq!(&ids[..4], &[10, 6, 7, 11]);
        let unknown = tiny().encode("zzz");
        assert_eq!(&unknown[..2], &[10, 11]);
    }

    #[test]
    fn long_texts_are_cut_and_still_end_with_the_end_symbol() {
        let long = "cat ".repeat(200);
        let ids = tiny().encode(&long);
        assert_eq!(ids.len(), CONTEXT);
        assert_eq!(ids[CONTEXT - 1], 11);
        assert_eq!(ids[0], 10);
    }

    #[test]
    fn content_length_counts_up_to_the_first_end_symbol() {
        let ids = tiny().encode("cat");
        assert_eq!(ClipTokenizer::content_len(&ids, 11), 3);
    }

    /// Vérification sur le vrai fichier (lancer avec KLIPPR_TOKENIZER=chemin) : « a photo of a cat » = 320 1125 539 320 2368.
    #[test]
    #[ignore]
    fn real_tokenizer_matches_openai_clip() {
        let path = std::env::var("KLIPPR_TOKENIZER").expect("KLIPPR_TOKENIZER");
        let tk = ClipTokenizer::from_json(&std::fs::read_to_string(path).unwrap()).unwrap();
        let ids = tk.encode("a photo of a cat");
        assert_eq!(&ids[..7], &[49406, 320, 1125, 539, 320, 2368, 49407]);
        let ids = tk.encode("A Photo of a Cat!");
        assert_eq!(&ids[..8], &[49406, 320, 1125, 539, 320, 2368, 256, 49407]);
    }
}
