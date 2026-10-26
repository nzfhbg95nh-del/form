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
    /// Couleur de remplissage (#rrggbb) ; rien = pas de remplissage.
    #[serde(default)]
    pub fill: Option<String>,
    /// Couleur du contour (#rrggbb) ; rien = pas de contour.
    #[serde(default)]
    pub stroke: Option<String>,
    /// Épaisseur du contour.
    #[serde(default)]
    pub sw: f64,
    /// Les autres morceaux du tracé (les trous d'une tache qui fait une boucle, par exemple).
    #[serde(default)]
    pub subs: Vec<SubIo>,
}

/// Un morceau d'un tracé.
#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct SubIo {
    pub closed: bool,
    pub points: Vec<PointIo>,
}

/// Le remplissage et le contour des prochains objets dessinés (et de la sélection quand on les change).
#[derive(Deserialize, Serialize, Clone, Debug, Default)]
pub struct StyleIo {
    #[serde(default)]
    pub fill: Option<String>,
    #[serde(default)]
    pub stroke: Option<String>,
    #[serde(default)]
    pub sw: f64,
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
    /// Le bout de la gomme ou de la tache (taille, angle, aplatissement) : un rond autour du curseur.
    pub tip: Option<Value>,
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

/// Les données SVG d'un tracé à plusieurs morceaux (sur le plan décalé du moteur).
fn svg_of(p: &PathIo) -> String {
    let mut d = String::new();
    let mut one = |points: &[PointIo], closed: bool| {
        if points.is_empty() {
            return;
        }
        let at = |q: &PointIo| (q.x + OFFSET, q.y + OFFSET);
        let (x0, y0) = at(&points[0]);
        d.push_str(&format!("M {x0} {y0} "));
        let seg = |a: &PointIo, b: &PointIo| {
            let (ax, ay) = at(a);
            let (bx, by) = at(b);
            format!("C {} {} {} {} {bx} {by} ", ax + a.ox, ay + a.oy, bx + b.ix, by + b.iy)
        };
        for w in points.windows(2) {
            d.push_str(&seg(&w[0], &w[1]));
        }
        if closed && points.len() > 1 {
            d.push_str(&seg(&points[points.len() - 1], &points[0]));
            d.push_str("Z ");
        }
    };
    one(&p.points, p.closed);
    for e in &p.subs {
        one(&e.points, e.closed);
    }
    d
}

/// Remplissage, contour et épaisseur d'un objet (ou, sans objet, des prochains objets).
fn set_style(s: &mut Session, id: Option<u64>, st: &StyleIo) -> Result<(), String> {
    let target = |mut v: Value| {
        if let Some(id) = id {
            v["ids"] = json!([id]);
        }
        v["focus"] = json!(false);
        v
    };
    let paint = |c: &Option<String>| match c {
        Some(hex) => json!({ "color": hex }),
        None => json!({ "none": true }),
    };
    s.execute("paint.setFill", &target(paint(&st.fill))).map_err(|e| e.to_string())?;
    s.execute("paint.setStroke", &target(paint(&st.stroke))).map_err(|e| e.to_string())?;
    if st.stroke.is_some() && st.sw > 0.0 {
        let mut w = json!({ "weight": st.sw });
        if let Some(id) = id {
            w["ids"] = json!([id]);
        }
        s.execute("stroke.set", &w).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn pt(p: vectorcraft_engine::doc::NodeId) -> u64 {
    p.0
}

impl Vector {
    fn session(&mut self) -> Result<&mut Session, String> {
        self.session.as_mut().ok_or_else(|| "Le moteur de dessin n'est pas démarré.".to_string())
    }

    /// Le moteur repart d'un plan vide avec les tracés du moodboard.
    fn load(&mut self, paths: &[PathIo], selected: &[String], defaults: &StyleIo) -> Result<(), String> {
        let mut s = Session::new();
        s.execute("file.new", &json!({ "width": PLAN, "height": PLAN })).map_err(|e| e.to_string())?;
        self.to_node.clear();
        self.to_board.clear();
        for p in paths {
            if p.points.len() < 2 {
                continue;
            }
            let made = if p.subs.is_empty() {
                let anchors: Vec<Value> = p.points.iter().map(anchor_json).collect();
                s.execute("path.create", &json!({ "anchors": anchors, "closed": p.closed }))
            } else {
                s.execute("path.create", &json!({ "d": svg_of(p) }))
            }
            .map_err(|e| e.to_string())?;
            if let Some(id) = made.get("id").and_then(Value::as_u64) {
                self.to_node.insert(p.id.clone(), id);
                self.to_board.insert(id, p.id.clone());
                set_style(&mut s, Some(id), &StyleIo { fill: p.fill.clone(), stroke: p.stroke.clone(), sw: p.sw })?;
            }
        }
        s.execute("select.none", &json!({})).map_err(|e| e.to_string())?;
        // Les prochains objets dessinés prennent le style choisi dans Form.
        set_style(&mut s, None, defaults)?;
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
        let (mut found, selected_nodes): (Vec<(u64, PathIo)>, Vec<u64>) = {
            let s = self.session.as_ref().ok_or("Le moteur de dessin n'est pas démarré.")?;
            let st = s.doc().map_err(|e| e.to_string())?;
            let mut found = Vec::new();
            st.doc.walk(|n| {
                if let Some(pd) = n.path_data() {
                    let fill = n.appearance.fill_paint().color().map(|c| c.to_hex());
                    let stroke = n.appearance.stroke_paint().color().map(|c| c.to_hex());
                    let sw = n.appearance.stroke_width();
                    let points = |sp: &vectorcraft_geom::SubPath| -> Vec<PointIo> {
                        sp.anchors
                            .iter()
                            .map(|a| PointIo { x: a.p.x - OFFSET, y: a.p.y - OFFSET, ix: a.h_in.x - a.p.x, iy: a.h_in.y - a.p.y, ox: a.h_out.x - a.p.x, oy: a.h_out.y - a.p.y })
                            .collect()
                    };
                    // Le premier morceau est le tracé ; les autres (les trous d'une tache, par exemple) restent avec lui.
                    let mut parts = pd.subpaths.iter();
                    if let Some(first) = parts.next() {
                        let subs = parts.map(|sp| SubIo { closed: sp.closed, points: points(sp) }).filter(|e| e.points.len() >= 2).collect();
                        found.push((pt(n.id), PathIo { id: String::new(), fill, stroke, sw, closed: first.closed, points: points(first), subs }));
                    }
                }
            });
            (found, st.selection.objects.iter().map(|id| pt(*id)).collect())
        };
        // Les tracés nouveaux (faits par un outil) prennent un identifiant « vc… ».
        for (node, path) in found.iter_mut() {
            let board = self.to_board.entry(*node).or_insert_with(|| format!("vc{node}")).clone();
            self.to_node.entry(board.clone()).or_insert(*node);
            path.id = board;
        }
        out.paths = found.into_iter().map(|(_, p)| p).filter(|p| p.points.len() >= 2).collect();
        out.selected = selected_nodes.iter().filter_map(|n| self.to_board.get(n).cloned()).collect();
        let s = self.session.as_mut().ok_or("Le moteur de dessin n'est pas démarré.")?;
        let mut overlays = selection_overlays(s);
        overlays.extend(s.overlays(v).iter().map(overlay_json));
        out.overlays = overlays;
        out.tool = s.tool_id().to_string();
        out.busy = s.tool_busy();
        if matches!(out.tool.as_str(), "eraser" | "blobBrush") {
            out.tip = Some(s.tool_options());
        }
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
    fn start(&mut self, paths: &[PathIo], selected: &[String], tool: &str, zoom: f64, defaults: &StyleIo) -> Result<VectorOut, String> {
        self.load(paths, selected, defaults)?;
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

/// Ce que l'écran de VectorCraft dessine pour les objets choisis (son « selection_overlay », dans `crates/ui-egui/src/canvas.rs`) : le contour de
/// chaque objet choisi dans la couleur de son calque, ses points d'ancrage (pleins s'ils sont choisis) et les poignées des points choisis.
fn selection_overlays(s: &Session) -> Vec<Value> {
    use vectorcraft_engine::doc::NodeKind;
    let Ok(st) = s.doc() else { return vec![] };
    let tool = s.tool_id();
    let direct = vectorcraft_engine::tools::catalog::edits_anchors(tool);
    let curvature = tool == "curvature";
    // Taille des points : 4 (5 pour les outils de points) quand « Taille » vaut 3, comme par défaut.
    let size = |d: bool| if d { 5.0 } else { 4.0 };
    let mut out: Vec<Value> = vec![];
    let mut handles: Vec<(Point, Point, [u8; 3])> = vec![];
    let mut with_handles = 0;
    for id in &st.selection.objects {
        let Some(n) = st.doc.node(*id) else { continue };
        let color = st.doc.layer_color(*id);
        let partial = st.selection.partial(*id);
        if let Some(mut outline) = n.stroke_path() {
            outline.apply_affine(Affine::translate((-OFFSET, -OFFSET)));
            out.push(json!({ "t": "path", "d": outline.to_svg(), "color": color, "width": 1.0, "dashed": false }));
        }
        let NodeKind::Path { path, .. } = &n.kind else { continue };
        let selected_segments = st.selection.segments.get(id);
        if let Some(segments) = selected_segments {
            for &(si, seg) in segments {
                let Some(sp) = path.subpaths.get(si).filter(|sp| seg < sp.segment_count()) else { continue };
                let curve = sp.segment(seg);
                let mut bp = vectorcraft_geom::BezPath::new();
                bp.move_to(curve.p0);
                if sp.segment_is_line(seg) {
                    bp.line_to(curve.p3);
                } else {
                    bp.curve_to(curve.p1, curve.p2, curve.p3);
                }
                bp.apply_affine(Affine::translate((-OFFSET, -OFFSET)));
                out.push(json!({ "t": "path", "d": bp.to_svg(), "color": color, "width": 2.0, "dashed": false }));
            }
        }
        for (si, ai, a) in path.anchors() {
            // Un objet choisi en entier a tous ses points choisis ; les poignées ne se montrent que pour les outils de points.
            let (sel, handles_shown) = match partial {
                Some(set) => {
                    let sel = set.contains(&(si, ai));
                    (sel, sel)
                }
                None => (true, direct),
            };
            if !curvature && handles_shown {
                with_handles += 1;
                let sides = path.subpaths.get(si).map(|subpath| st.selection.handle_sides(*id, si, ai, subpath)).unwrap_or((true, true));
                for (h, show) in [(a.h_in, sides.0), (a.h_out, sides.1)] {
                    if show && h.distance(a.p) > 1e-6 {
                        handles.push((a.p, h, color));
                    }
                }
            }
            let anchor_selected = sel && selected_segments.is_none();
            let ink = if anchor_selected && partial.is_some() && color == [0x4f, 0x80, 0xff] { [0x3d, 0x82, 0xff] } else { color };
            if curvature {
                out.push(json!({ "t": "curvePoint", "p": p2(&a.p), "color": ink, "filled": anchor_selected && partial.is_some(), "size": 6.0 }));
            } else {
                out.push(json!({ "t": "anchor", "p": p2(&a.p), "color": ink, "filled": anchor_selected, "size": size(partial.is_some() || direct) }));
            }
        }
    }
    // Les poignées de rayon des coins (Sélection et Sélection directe) : un petit rond à chaque coin qu'on peut arrondir.
    if matches!(tool, "selection" | "directSelection") {
        if let Some(w) = vectorcraft_engine::tools::corners::CornerWidgets::showing(&st.doc, &st.selection, 1.0, tool == "directSelection", true, s.prefs.hide_corner_widget_above) {
            for (id, q) in w.visible_on() {
                out.push(json!({ "t": "cornerWidget", "p": p2(&q), "color": st.doc.layer_color(id) }));
            }
        }
    }
    if s.prefs.show_handles_multiple_anchors || with_handles <= 1 {
        for (a, h, color) in handles {
            out.push(json!({ "t": "line", "a": p2(&a), "b": p2(&h), "color": color, "dashed": false }));
            out.push(json!({ "t": "handle", "p": p2(&h), "color": color }));
        }
    }
    out
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
pub fn vc_load(state: tauri::State<VectorState>, paths: Vec<PathIo>, selected: Vec<String>, tool: String, zoom: f64, defaults: StyleIo) -> Result<VectorOut, String> {
    with(&state, |v| v.start(&paths, &selected, &tool, zoom, &defaults))
}

/// Change le remplissage et le contour : ceux des objets choisis, et ceux des prochains objets.
#[tauri::command]
pub fn vc_paint(state: tauri::State<VectorState>, style: StyleIo, zoom: f64) -> Result<VectorOut, String> {
    with(&state, |v| {
        set_style(v.session()?, None, &style)?;
        v.snapshot(zoom, vec![])
    })
}

/// Change le style de tracés précis (par exemple les formes de tache, qui ne doivent pas être remplies) sans toucher aux couleurs des prochains objets.
#[tauri::command]
pub fn vc_restyle(state: tauri::State<VectorState>, ids: Vec<String>, style: StyleIo, defaults: StyleIo, zoom: f64) -> Result<VectorOut, String> {
    with(&state, |v| {
        let nodes: Vec<u64> = ids.iter().filter_map(|i| v.to_node.get(i).copied()).collect();
        let s = v.session()?;
        let previous: Vec<u64> = s.doc().map_err(|e| e.to_string())?.selection.objects.iter().map(|id| id.0).collect();
        for n in &nodes {
            set_style(s, Some(*n), &style)?;
        }
        // Changer le style d'un objet change aussi celui des prochains : on remet celui qui était choisi.
        s.execute("select.none", &json!({})).map_err(|e| e.to_string())?;
        set_style(s, None, &defaults)?;
        if !previous.is_empty() {
            s.execute("select.set", &json!({ "ids": previous })).map_err(|e| e.to_string())?;
        }
        v.snapshot(zoom, vec![])
    })
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
        v.start(&[], &[], tool, 1.0, &StyleIo { fill: None, stroke: Some("#000000".into()), sw: 1.0 }).expect("démarrage");
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
        let path = PathIo { id: "a".into(), closed: false, points: vec![PointIo { x: 10.0, y: 10.0, ix: 0.0, iy: 0.0, ox: 0.0, oy: 0.0 }, PointIo { x: 200.0, y: 10.0, ix: 0.0, iy: 0.0, ox: 0.0, oy: 0.0 }], fill: None, stroke: Some("#ff0000".into()), sw: 3.0, subs: vec![] };
        v.start(&[path], &[], "directSelection", 1.0, &StyleIo::default()).expect("démarrage");
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

    #[test]
    fn le_style_fait_l_aller_retour_et_les_formes_sont_des_tracés() {
        let mut v = Vector::default();
        let path = PathIo { id: "a".into(), closed: false, points: vec![PointIo { x: 10.0, y: 10.0, ix: 0.0, iy: 0.0, ox: 0.0, oy: 0.0 }, PointIo { x: 200.0, y: 10.0, ix: 0.0, iy: 0.0, ox: 0.0, oy: 0.0 }], fill: None, stroke: Some("#ff0000".into()), sw: 3.0, subs: vec![] };
        let out = v.start(&[path], &[], "rectangle", 1.0, &StyleIo { fill: Some("#00ff00".into()), stroke: Some("#0000ff".into()), sw: 2.0 }).expect("démarrage");
        assert_eq!(out.paths[0].stroke.as_deref(), Some("#ff0000"));
        assert!((out.paths[0].sw - 3.0).abs() < 1e-6);
        assert!(out.paths[0].fill.is_none());
        // un rectangle dessiné prend le style choisi
        ptr(&mut v, "down", 300.0, 300.0);
        ptr(&mut v, "drag", 400.0, 380.0);
        let out = ptr(&mut v, "up", 400.0, 380.0);
        let made = out.paths.iter().find(|p| p.id != "a").expect("le rectangle");
        assert_eq!(made.points.len(), 4);
        assert_eq!(made.fill.as_deref(), Some("#00ff00"));
        assert_eq!(made.stroke.as_deref(), Some("#0000ff"));
    }

    #[test]
    fn une_tache_qui_fait_une_boucle_garde_un_trou() {
        let mut v = started("blobBrush");
        let n = 60;
        ptr(&mut v, "down", 300.0 + 100.0, 300.0);
        for i in 1..=n {
            let a = std::f64::consts::TAU * i as f64 / n as f64;
            ptr(&mut v, "drag", 300.0 + 100.0 * a.cos(), 300.0 + 100.0 * a.sin());
        }
        let out = ptr(&mut v, "up", 400.0, 300.0);
        assert_eq!(out.paths.len(), 1, "{:?}", out.paths.iter().map(|p| p.points.len()).collect::<Vec<_>>());
        assert!(!out.paths[0].subs.is_empty(), "le trou de la boucle doit rester un morceau du même tracé");
    }


    fn trois() -> Vec<PathIo> {
        vec![
            pio("a", true, &[(100.0, 100.0), (300.0, 100.0), (300.0, 250.0), (100.0, 250.0)]),
            pio("b", false, &[(400.0, 100.0), (500.0, 200.0), (600.0, 120.0)]),
            PathIo { fill: Some("#00ff00".into()), ..pio("c", true, &[(150.0, 350.0), (350.0, 350.0), (250.0, 480.0)]) },
        ]
    }
    fn demarre(tool: &str, sel: &[&str]) -> Vector {
        let mut v = Vector::default();
        let sel: Vec<String> = sel.iter().map(|s| s.to_string()).collect();
        v.start(&trois(), &sel, tool, 1.0, &StyleIo { fill: None, stroke: Some("#000000".into()), sw: 1.0 }).expect("démarrage");
        v
    }

    #[test]
    fn les_outils_de_selection_choisissent_les_bons_tracés() {
        let mut v = demarre("magicWand", &[]);
        let o = click(&mut v, 250.0, 420.0);
        assert_eq!(o.selected, vec!["c".to_string()], "la baguette magique choisit les tracés de même remplissage");
        let mut v = demarre("lasso", &[]);
        ptr(&mut v, "down", 100.0, 300.0);
        for (x, y) in [(400.0, 300.0), (400.0, 520.0), (100.0, 520.0), (100.0, 300.0)] {
            ptr(&mut v, "drag", x, y);
        }
        let o = ptr(&mut v, "up", 100.0, 300.0);
        assert!(o.selected.contains(&"c".to_string()), "le lasso choisit ce qu'il entoure : {:?}", o.selected);
    }

    #[test]
    fn la_pipette_copie_le_style() {
        let mut v = demarre("eyedropper", &["a"]);
        let o = click(&mut v, 250.0, 420.0);
        let a = o.paths.iter().find(|p| p.id == "a").unwrap();
        assert_eq!(a.fill.as_deref(), Some("#00ff00"), "la pipette donne le remplissage de c à a");
    }

    #[test]
    fn la_rotation_tourne_la_selection() {
        let mut v = demarre("rotate", &["a"]);
        let avant = fingerprint(&v.snapshot(1.0, vec![]).unwrap());
        ptr(&mut v, "down", 200.0, 175.0);
        ptr(&mut v, "up", 200.0, 175.0);
        ptr(&mut v, "down", 400.0, 175.0);
        ptr(&mut v, "drag", 200.0, 300.0);
        let o = ptr(&mut v, "up", 200.0, 300.0);
        assert_ne!(avant, fingerprint(&o), "la rotation doit changer le tracé choisi");
    }

    #[test]
    fn la_mise_a_l_echelle_agrandit_la_selection() {
        let mut v = demarre("scale", &["a"]);
        let avant = fingerprint(&v.snapshot(1.0, vec![]).unwrap());
        ptr(&mut v, "down", 100.0, 100.0);
        ptr(&mut v, "up", 100.0, 100.0);
        ptr(&mut v, "down", 300.0, 250.0);
        ptr(&mut v, "drag", 400.0, 350.0);
        let o = ptr(&mut v, "up", 400.0, 350.0);
        assert_ne!(avant, fingerprint(&o));
    }

    #[test]
    fn le_couteau_et_les_ciseaux_coupent() {
        let mut v = demarre("knife", &[]);
        ptr(&mut v, "down", 50.0, 175.0);
        ptr(&mut v, "drag", 200.0, 175.0);
        ptr(&mut v, "drag", 350.0, 175.0);
        let o = ptr(&mut v, "up", 350.0, 175.0);
        assert!(o.paths.len() > 3, "le couteau coupe a en deux : {} tracés", o.paths.len());
        let mut v = demarre("scissors", &[]);
        let o = click(&mut v, 200.0, 100.0);
        assert!(fingerprint(&o) != fingerprint(&demarre("scissors", &[]).snapshot(1.0, vec![]).unwrap()), "les ciseaux coupent le tracé au clic");
    }


    fn pio(id: &str, closed: bool, pts: &[(f64, f64)]) -> PathIo {
        PathIo { id: id.into(), closed, points: pts.iter().map(|&(x, y)| PointIo { x, y, ix: 0.0, iy: 0.0, ox: 0.0, oy: 0.0 }).collect(), fill: Some("#ff0000".into()), stroke: Some("#000000".into()), sw: 2.0, subs: vec![] }
    }

    fn fingerprint(o: &VectorOut) -> String {
        o.paths
            .iter()
            .map(|p| format!("{}:{}:{:?}:{:?}:{}:{}", p.id, p.closed, p.fill, p.stroke, p.sw, p.points.iter().map(|q| format!("{:.1},{:.1},{:.1},{:.1},{:.1},{:.1}", q.x, q.y, q.ix, q.iy, q.ox, q.oy)).collect::<Vec<_>>().join(";") + &p.subs.len().to_string()))
            .collect::<Vec<_>>()
            .join("|")
    }

    /// Balayage de tous les outils de la barre : chacun reçoit des gestes variés sur un moodboard d'essai ; on relève les erreurs, les paniques,
    /// les dessins que l'écran ne sait pas montrer et les gestes qui ne changent jamais rien.
    #[test]
    fn sonde_tous_les_outils() {
        let tools = [
            "directSelection", "groupSelection", "magicWand", "lasso", "pen", "addAnchor", "deleteAnchor", "anchorPoint", "curvature", "lineSegment", "arc", "spiral",
            "rectangularGrid", "polarGrid", "rectangle", "roundedRectangle", "ellipse", "polygon", "star", "flare", "paintbrush", "blobBrush", "shaper", "pencil", "smooth",
            "pathEraser", "join", "eraser", "scissors", "knife", "mirrorCut", "lineCut", "rectCut", "rotate", "reflect", "scale", "shear", "reshape", "freeTransform",
            "shapeBuilder", "eyedropper", "measure",
        ];
        let mut report = vec![];
        for tool in tools {
            let paths = vec![
                pio("a", true, &[(100.0, 100.0), (300.0, 100.0), (300.0, 250.0), (100.0, 250.0)]),
                pio("b", false, &[(400.0, 100.0), (500.0, 200.0), (600.0, 120.0)]),
                pio("c", true, &[(150.0, 350.0), (350.0, 350.0), (250.0, 480.0)]),
            ];
            let mut v = Vector::default();
            let run = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let mut notes: Vec<String> = vec![];
                let mut last = match v.start(&paths, &["a".to_string()], tool, 1.0, &StyleIo { fill: Some("#00ff00".into()), stroke: Some("#0000ff".into()), sw: 2.0 }) {
                    Ok(o) => o,
                    Err(e) => return vec![format!("ERREUR au démarrage : {e}")],
                };
                let mut kinds: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
                let gestures: Vec<(&str, Vec<(&str, f64, f64)>)> = vec![
                    ("glisser", vec![("down", 120.0, 120.0), ("drag", 200.0, 160.0), ("drag", 280.0, 220.0), ("up", 280.0, 220.0)]),
                    ("glisser-sur-bord", vec![("down", 300.0, 175.0), ("drag", 340.0, 175.0), ("drag", 380.0, 190.0), ("up", 380.0, 190.0)]),
                    ("clic-point", vec![("down", 300.0, 100.0), ("up", 300.0, 100.0)]),
                    ("clic-courbe", vec![("down", 200.0, 100.0), ("up", 200.0, 100.0)]),
                    ("clic-vide", vec![("down", 700.0, 500.0), ("up", 700.0, 500.0)]),
                    ("double", vec![("down", 500.0, 200.0), ("up", 500.0, 200.0), ("double", 500.0, 200.0)]),
                    ("traverse", vec![("down", 50.0, 175.0), ("drag", 200.0, 175.0), ("drag", 650.0, 175.0), ("up", 650.0, 175.0)]),
                    ("glisser-2e", vec![("down", 420.0, 130.0), ("drag", 450.0, 150.0), ("drag", 520.0, 260.0), ("up", 520.0, 260.0)]),
                ];
                let mut changing = vec![];
                for (name, evs) in gestures {
                    let before = fingerprint(&last);
                    for (kind, x, y) in evs {
                        match v.pointer(&PointerIn { kind: kind.into(), x, y, mods: ModsIn::default(), pressure: None }, 1.0) {
                            Ok(o) => {
                                for ov in &o.overlays {
                                    if let Some(t) = ov.get("t").and_then(|t| t.as_str()) {
                                        kinds.insert(t.to_string());
                                    }
                                }
                                if o.switch_tool.is_some() {
                                    notes.push(format!("{name}: demande l'outil {:?}", o.switch_tool));
                                }
                                if o.status.is_some() {
                                    notes.push(format!("{name}: état {:?}", o.status));
                                }
                                last = o;
                            }
                            Err(e) => notes.push(format!("ERREUR {name}/{kind} : {e}")),
                        }
                    }
                    if fingerprint(&last) != before {
                        changing.push(name);
                    }
                    for key in ["Enter", "Escape"] {
                        match v.key(key, ModsIn::default(), 1.0) {
                            Ok(o) => last = o,
                            Err(e) => notes.push(format!("ERREUR {name}/{key} : {e}")),
                        }
                    }
                }
                notes.push(format!("change avec : {changing:?}"));
                notes.push(format!("dessins : {kinds:?}"));
                notes
            }));
            match run {
                Ok(notes) => report.push(format!("{tool:16} {}", notes.join(" | "))),
                Err(_) => report.push(format!("{tool:16} PANIQUE")),
            }
        }
        eprintln!("
{}", report.join("
"));
    }
}
