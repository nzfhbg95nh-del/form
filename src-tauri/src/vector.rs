// Outils de dessin vectoriel de Form : la plume, la flèche blanche, le crayon, etc. viennent de VectorCraft
// (dépôt storytold/vectorcraft, licence MIT ou Apache-2.0), utilisé tel quel comme bibliothèque Rust.
// Ici, seulement la colle : Form envoie les tracés du moodboard et les gestes de la souris, le moteur de
// VectorCraft répond avec les tracés modifiés, ce qu'il faut dessiner par-dessus (points, poignées, repères)
// et la forme du curseur. Rien du comportement des outils n'est réécrit.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use vectorcraft_engine::tools::{Cursor, Mods, Overlay, PointerEvent, PointerKind, ToolKey};
use vectorcraft_engine::{Session, UiRequest, ViewInfo};
use vectorcraft_geom::{Affine, Point};

/// Le moteur travaille dans un grand plan de coordonnées positives ; la toile du moodboard peut aller dans le négatif :
/// tout est décalé de cette valeur à l'aller et au retour.
const OFFSET: f64 = 50_000.0;
const PLAN: f64 = 100_000.0;

#[derive(Default)]
pub struct VectorState(Mutex<Vector>);

#[derive(Default)]
struct Vector {
    session: Option<Session>,
    /// Identifiant du moodboard → identifiant du nœud dans le moteur, et l'inverse.
    to_node: HashMap<String, u64>,
    to_board: HashMap<u64, String>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct PointIo {
    pub x: f64,
    pub y: f64,
    #[serde(default)]
    pub ix: f64,
    #[serde(default)]
    pub iy: f64,
    #[serde(default)]
    pub ox: f64,
    #[serde(default)]
    pub oy: f64,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct PathIo {
    pub id: String,
    pub closed: bool,
    pub points: Vec<PointIo>,
}

#[derive(Deserialize, Default, Clone, Copy, Debug)]
pub struct ModsIn {
    #[serde(default)]
    pub shift: bool,
    #[serde(default)]
    pub alt: bool,
    #[serde(default)]
    pub ctrl: bool,
    #[serde(default)]
    pub space: bool,
}

impl ModsIn {
    fn mods(self) -> Mods {
        // Sous Windows, « cmd » du moteur est la touche Ctrl.
        Mods { shift: self.shift, alt: self.alt, cmd: self.ctrl, ctrl: false, space: self.space }
    }
}

#[derive(Deserialize, Debug)]
pub struct PointerIn {
    pub kind: String,
    pub x: f64,
    pub y: f64,
    #[serde(default)]
    pub mods: ModsIn,
    #[serde(default)]
    pub pressure: Option<f32>,
}

#[derive(Serialize, Default, Debug)]
pub struct VectorOut {
    /// Tous les tracés du moteur, tels qu'ils sont maintenant.
    pub paths: Vec<PathIo>,
    /// Les tracés sélectionnés.
    pub selected: Vec<String>,
    pub overlays: Vec<Value>,
    pub cursor: String,
    pub tool: String,
    /// Un outil demande de passer à un autre outil (par exemple après un tracé).
    pub switch_tool: Option<String>,
    pub status: Option<String>,
    pub busy: bool,
}

fn view(zoom: f64) -> ViewInfo {
    ViewInfo { zoom: if zoom.is_finite() && zoom > 0.0 { zoom } else { 1.0 }, ..ViewInfo::default() }
}

fn anchor_json(p: &PointIo) -> Value {
    let (x, y) = (p.x + OFFSET, p.y + OFFSET);
    let mut a = json!({ "x": x, "y": y });
    if p.ix != 0.0 || p.iy != 0.0 {
        a["in"] = json!([x + p.ix, y + p.iy]);
    }
    if p.ox != 0.0 || p.oy != 0.0 {
        a["out"] = json!([x + p.ox, y + p.oy]);
    }
    a
}

fn pt(p: vectorcraft_engine::doc::NodeId) -> u64 {
    p.0
}

impl Vector {
    fn session(&mut self) -> Result<&mut Session, String> {
        self.session.as_mut().ok_or_else(|| "Le moteur de dessin n'est pas démarré.".to_string())
    }

    /// Le moteur repart d'un plan vide avec les tracés du moodboard.
    fn load(&mut self, paths: &[PathIo], selected: &[String]) -> Result<(), String> {
        let mut s = Session::new();
        s.execute("file.new", &json!({ "width": PLAN, "height": PLAN })).map_err(|e| e.to_string())?;
        self.to_node.clear();
        self.to_board.clear();
        for p in paths {
            if p.points.len() < 2 {
                continue;
            }
            let anchors: Vec<Value> = p.points.iter().map(anchor_json).collect();
            let made = s.execute("path.create", &json!({ "anchors": anchors, "closed": p.closed })).map_err(|e| e.to_string())?;
            if let Some(id) = made.get("id").and_then(Value::as_u64) {
                self.to_node.insert(p.id.clone(), id);
                self.to_board.insert(id, p.id.clone());
            }
        }
        let ids: Vec<u64> = selected.iter().filter_map(|s| self.to_node.get(s).copied()).collect();
        if ids.is_empty() {
            s.execute("select.none", &json!({})).map_err(|e| e.to_string())?;
        } else {
            s.execute("select.set", &json!({ "ids": ids })).map_err(|e| e.to_string())?;
        }
        self.session = Some(s);
        Ok(())
    }

    fn snapshot(&mut self, zoom: f64, requests: Vec<UiRequest>) -> Result<VectorOut, String> {
        let v = view(zoom);
        let mut out = VectorOut::default();
        let (mut found, selected_nodes): (Vec<(u64, Vec<PathIo>)>, Vec<u64>) = {
            let s = self.session.as_ref().ok_or("Le moteur de dessin n'est pas démarré.")?;
            let st = s.doc().map_err(|e| e.to_string())?;
            let mut found = Vec::new();
            st.doc.walk(|n| {
                if let Some(pd) = n.path_data() {
                    let subs = pd
                        .subpaths
                        .iter()
                        .map(|sp| PathIo {
                            id: String::new(),
                            closed: sp.closed,
                            points: sp
                                .anchors
                                .iter()
                                .map(|a| PointIo { x: a.p.x - OFFSET, y: a.p.y - OFFSET, ix: a.h_in.x - a.p.x, iy: a.h_in.y - a.p.y, ox: a.h_out.x - a.p.x, oy: a.h_out.y - a.p.y })
                                .collect(),
                        })
                        .collect();
                    found.push((pt(n.id), subs));
                }
            });
            (found, st.selection.objects.iter().map(|id| pt(*id)).collect())
        };
        // Les tracés nouveaux (faits par un outil) prennent un identifiant « vc… ».
        for (node, subs) in found.iter_mut() {
            let board = self.to_board.entry(*node).or_insert_with(|| format!("vc{node}")).clone();
            self.to_node.entry(board.clone()).or_insert(*node);
            for (i, sp) in subs.iter_mut().enumerate() {
                sp.id = if i == 0 { board.clone() } else { format!("{board}#{i}") };
            }
        }
        out.paths = found.into_iter().flat_map(|(_, subs)| subs).filter(|p| p.points.len() >= 2).collect();
        out.selected = selected_nodes.iter().filter_map(|n| self.to_board.get(n).cloned()).collect();
        let s = self.session.as_mut().ok_or("Le moteur de dessin n'est pas démarré.")?;
        out.overlays = s.overlays(v).iter().map(overlay_json).collect();
        out.tool = s.tool_id().to_string();
        out.busy = s.tool_busy();
        for r in requests {
            match r {
                UiRequest::SwitchTool(t) => out.switch_tool = Some(t),
                UiRequest::Status(m) => out.status = Some(m),
                _ => {}
            }
        }
        Ok(out)
    }
}

impl Vector {
    fn start(&mut self, paths: &[PathIo], selected: &[String], tool: &str, zoom: f64) -> Result<VectorOut, String> {
        self.load(paths, selected)?;
        self.session()?.select_tool(tool, view(zoom)).map_err(|e| e.to_string())?;
        let mut out = self.snapshot(zoom, vec![])?;
        out.cursor = cursor_name(self.session()?.cursor(Point::new(0.0, 0.0), Mods::default(), view(zoom)));
        Ok(out)
    }

    fn pointer(&mut self, event: &PointerIn, zoom: f64) -> Result<VectorOut, String> {
        let kind = kind_of(&event.kind).ok_or_else(|| format!("geste inconnu : {}", event.kind))?;
        let mods = event.mods.mods();
        let mut ev = PointerEvent::new(kind, event.x + OFFSET, event.y + OFFSET).with_mods(mods);
        if let Some(p) = event.pressure {
            ev.pressure = p;
        }
        let at = ev.pos;
        let reqs = self.session()?.pointer(&ev, view(zoom)).map_err(|e| e.to_string())?;
        let mut out = self.snapshot(zoom, reqs)?;
        out.cursor = cursor_name(self.session()?.cursor(at, mods, view(zoom)));
        Ok(out)
    }

    fn key(&mut self, key: &str, mods: ModsIn, zoom: f64) -> Result<VectorOut, String> {
        let Some(k) = key_of(key) else { return self.snapshot(zoom, vec![]) };
        let reqs = self.session()?.tool_key(k, mods.mods(), view(zoom)).map_err(|e| e.to_string())?;
        self.snapshot(zoom, reqs)
    }
}

fn kind_of(s: &str) -> Option<PointerKind> {
    match s {
        "down" => Some(PointerKind::Down),
        "move" => Some(PointerKind::Move),
        "drag" => Some(PointerKind::Drag),
        "up" => Some(PointerKind::Up),
        "double" => Some(PointerKind::DoubleClick),
        _ => None,
    }
}

fn key_of(s: &str) -> Option<ToolKey> {
    Some(match s {
        "Enter" => ToolKey::Enter,
        "Escape" => ToolKey::Escape,
        "Backspace" => ToolKey::Backspace,
        "Delete" => ToolKey::Delete,
        "ArrowUp" => ToolKey::Up,
        "ArrowDown" => ToolKey::Down,
        "ArrowLeft" => ToolKey::Left,
        "ArrowRight" => ToolKey::Right,
        "Tab" => ToolKey::Tab,
        "Home" => ToolKey::Home,
        "End" => ToolKey::End,
        "[" => ToolKey::BracketLeft,
        "]" => ToolKey::BracketRight,
        d if d.len() == 1 && d.as_bytes()[0].is_ascii_digit() => ToolKey::Digit(d.as_bytes()[0] - b'0'),
        l if l.chars().count() == 1 && l.chars().next().is_some_and(|c| c.is_ascii_alphabetic()) => ToolKey::Letter(l.chars().next()?.to_ascii_lowercase()),
        _ => return None,
    })
}

fn p2(p: &Point) -> Value {
    json!([p.x - OFFSET, p.y - OFFSET])
}

fn overlay_json(o: &Overlay) -> Value {
    match o {
        Overlay::Marquee(r) => json!({ "t": "marquee", "x0": r.x0 - OFFSET, "y0": r.y0 - OFFSET, "x1": r.x1 - OFFSET, "y1": r.y1 - OFFSET }),
        Overlay::Path { path, color, width, dashed } => {
            let mut moved = path.clone();
            moved.apply_affine(Affine::translate((-OFFSET, -OFFSET)));
            json!({ "t": "path", "d": moved.to_svg(), "color": color, "width": width, "dashed": dashed })
        }
        Overlay::Line { a, b, color, dashed } => json!({ "t": "line", "a": p2(a), "b": p2(b), "color": color, "dashed": dashed }),
        Overlay::Anchor { p, color, filled, size } => json!({ "t": "anchor", "p": p2(p), "color": color, "filled": filled, "size": size }),
        Overlay::CurvePoint { p, color, filled, size } => json!({ "t": "curvePoint", "p": p2(p), "color": color, "filled": filled, "size": size }),
        Overlay::Handle { p, color } => json!({ "t": "handle", "p": p2(p), "color": color }),
        Overlay::Label { p, text, color } => json!({ "t": "label", "p": p2(p), "text": text, "color": color }),
        Overlay::Measure { p, text } => json!({ "t": "measure", "p": p2(p), "text": text }),
        Overlay::Distance { a, b, text, color } => json!({ "t": "distance", "a": p2(a), "b": p2(b), "text": text, "color": color }),
        Overlay::Highlight { quad, color } => json!({ "t": "highlight", "quad": quad.iter().map(p2).collect::<Vec<_>>(), "color": color }),
        Overlay::Swatch { p, color, selected } => json!({ "t": "swatch", "p": p2(p), "color": color, "selected": selected }),
        Overlay::GridLine { a, b, color } => json!({ "t": "gridLine", "a": p2(a), "b": p2(b), "color": color }),
        #[allow(unreachable_patterns)]
        _ => json!({ "t": "none" }),
    }
}

fn cursor_name(c: Cursor) -> String {
    format!("{c:?}")
}

fn with<R>(state: &VectorState, f: impl FnOnce(&mut Vector) -> Result<R, String>) -> Result<R, String> {
    let mut guard = state.0.lock().map_err(|_| "Le moteur de dessin est bloqué.".to_string())?;
    f(&mut guard)
}

/// Démarre le moteur avec les tracés du moodboard et choisit l'outil.
#[tauri::command]
pub fn vc_load(state: tauri::State<VectorState>, paths: Vec<PathIo>, selected: Vec<String>, tool: String, zoom: f64) -> Result<VectorOut, String> {
    with(&state, |v| v.start(&paths, &selected, &tool, zoom))
}

/// Change d'outil (le moteur termine le geste en cours).
#[tauri::command]
pub fn vc_tool(state: tauri::State<VectorState>, tool: String, zoom: f64) -> Result<VectorOut, String> {
    with(&state, |v| {
        v.session()?.select_tool(&tool, view(zoom)).map_err(|e| e.to_string())?;
        v.snapshot(zoom, vec![])
    })
}

/// Un geste de la souris (appui, déplacement, glissement, relâchement, double-clic).
#[tauri::command]
pub fn vc_pointer(state: tauri::State<VectorState>, event: PointerIn, zoom: f64) -> Result<VectorOut, String> {
    with(&state, |v| v.pointer(&event, zoom))
}

/// Une touche pour l'outil actif (Entrée, Échap, Suppr, flèches…).
#[tauri::command]
pub fn vc_key(state: tauri::State<VectorState>, key: String, mods: ModsIn, zoom: f64) -> Result<VectorOut, String> {
    with(&state, |v| v.key(&key, mods, zoom))
}

/// Ferme le moteur.
#[tauri::command]
pub fn vc_close(state: tauri::State<VectorState>) -> Result<(), String> {
    with(&state, |v| {
        v.session = None;
        v.to_node.clear();
        v.to_board.clear();
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ptr(v: &mut Vector, kind: &str, x: f64, y: f64) -> VectorOut {
        v.pointer(&PointerIn { kind: kind.into(), x, y, mods: ModsIn::default(), pressure: None }, 1.0).expect("geste")
    }
    fn click(v: &mut Vector, x: f64, y: f64) -> VectorOut {
        ptr(v, "down", x, y);
        ptr(v, "up", x, y)
    }
    fn started(tool: &str) -> Vector {
        let mut v = Vector::default();
        v.start(&[], &[], tool, 1.0).expect("démarrage");
        v
    }

    #[test]
    fn la_plume_trace_et_ferme_un_chemin() {
        let mut v = started("pen");
        click(&mut v, 100.0, 100.0);
        click(&mut v, 300.0, 100.0);
        let out = click(&mut v, 300.0, 300.0);
        assert_eq!(out.paths.len(), 1);
        assert_eq!(out.paths[0].points.len(), 3);
        assert!(!out.paths[0].closed);
        // un clic sur le premier point ferme le tracé
        let out = click(&mut v, 101.0, 101.0);
        assert!(out.paths[0].closed, "{:?}", out.paths);
        assert_eq!(out.paths[0].points.len(), 3);
        // les coordonnées reviennent sur la toile du moodboard
        assert!((out.paths[0].points[0].x - 100.0).abs() < 1e-6);
    }

    #[test]
    fn la_plume_en_glissant_donne_un_point_lisse() {
        let mut v = started("pen");
        click(&mut v, 0.0, 0.0);
        ptr(&mut v, "down", 200.0, 0.0);
        ptr(&mut v, "drag", 260.0, -40.0);
        let out = ptr(&mut v, "up", 260.0, -40.0);
        let p = &out.paths[0].points[1];
        assert!((p.ox - 60.0).abs() < 1e-6 && (p.oy + 40.0).abs() < 1e-6, "{p:?}");
        assert!((p.ix + 60.0).abs() < 1e-6 && (p.iy - 40.0).abs() < 1e-6, "{p:?}");
    }

    #[test]
    fn les_tracés_du_moodboard_sont_repris_et_modifiés_par_la_fleche_blanche() {
        let mut v = Vector::default();
        let path = PathIo { id: "a".into(), closed: false, points: vec![PointIo { x: 10.0, y: 10.0, ix: 0.0, iy: 0.0, ox: 0.0, oy: 0.0 }, PointIo { x: 200.0, y: 10.0, ix: 0.0, iy: 0.0, ox: 0.0, oy: 0.0 }] };
        v.start(&[path], &[], "directSelection", 1.0).expect("démarrage");
        // on attrape le deuxième point et on le descend
        ptr(&mut v, "down", 200.0, 10.0);
        ptr(&mut v, "drag", 200.0, 60.0);
        let out = ptr(&mut v, "up", 200.0, 60.0);
        assert_eq!(out.paths.len(), 1);
        assert_eq!(out.paths[0].id, "a");
        assert!((out.paths[0].points[1].y - 60.0).abs() < 1e-6, "{:?}", out.paths[0].points);
        assert!((out.paths[0].points[0].y - 10.0).abs() < 1e-6);
    }

    #[test]
    fn le_crayon_donne_un_tracé_lissé() {
        let mut v = started("pencil");
        ptr(&mut v, "down", 0.0, 0.0);
        for i in 1..=40 {
            let x = i as f64 * 5.0;
            ptr(&mut v, "drag", x, (x / 30.0).sin() * 40.0);
        }
        let out = ptr(&mut v, "up", 200.0, (200.0f64 / 30.0).sin() * 40.0);
        assert_eq!(out.paths.len(), 1);
        let n = out.paths[0].points.len();
        assert!(n >= 2 && n < 20, "{n} points");
    }
}
