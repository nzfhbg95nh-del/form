// Généré d'après le catalogue d'outils de VectorCraft (crates/tools/src/catalog.rs, noms français : crates/ui-egui/src/i18n/fr.tsv) — MIT ou Apache-2.0.
// Ne pas modifier à la main.

export interface ToolInfo {
  id: string
  en: string
  label: string
  shortcut: string | null
  /** Nom du fichier d'icône dans src/assets/vc-icons. */
  svg: string
}

export const TOOL_GROUPS: ToolInfo[][] = [
  [
    {
      "id": "selection",
      "en": "Selection Tool",
      "label": "Outil Sélection",
      "shortcut": "V",
      "svg": "dc-selection"
    }
  ],
  [
    {
      "id": "directSelection",
      "en": "Direct Selection Tool",
      "label": "Outil Sélection directe",
      "shortcut": "A",
      "svg": "dc-direct"
    },
    {
      "id": "groupSelection",
      "en": "Group Selection Tool",
      "label": "Outil Sélection directe progressive",
      "shortcut": null,
      "svg": "dc-group-select"
    }
  ],
  [
    {
      "id": "magicWand",
      "en": "Magic Wand Tool",
      "label": "Outil Baguette magique",
      "shortcut": "Y",
      "svg": "wand-sparkles"
    }
  ],
  [
    {
      "id": "lasso",
      "en": "Lasso Tool",
      "label": "Outil Lasso",
      "shortcut": "Q",
      "svg": "lasso"
    }
  ],
  [
    {
      "id": "pen",
      "en": "Pen Tool",
      "label": "Outil Plume",
      "shortcut": "P",
      "svg": "pen-tool"
    },
    {
      "id": "addAnchor",
      "en": "Add Anchor Point Tool",
      "label": "Outil Ajout de point d’ancrage",
      "shortcut": "+",
      "svg": "pen-tool-add"
    },
    {
      "id": "deleteAnchor",
      "en": "Delete Anchor Point Tool",
      "label": "Outil Suppression de point d’ancrage",
      "shortcut": "-",
      "svg": "pen-tool-delete"
    },
    {
      "id": "anchorPoint",
      "en": "Anchor Point Tool",
      "label": "Outil Point d’ancrage",
      "shortcut": "Shift+C",
      "svg": "dc-anchor"
    }
  ],
  [
    {
      "id": "curvature",
      "en": "Curvature Tool",
      "label": "Outil Courbure",
      "shortcut": "Shift+~",
      "svg": "spline"
    }
  ],
  [
    {
      "id": "type",
      "en": "Type Tool",
      "label": "Outil Texte",
      "shortcut": "T",
      "svg": "type"
    },
    {
      "id": "areaType",
      "en": "Area Type Tool",
      "label": "Outil Texte captif",
      "shortcut": null,
      "svg": "dc-type-area"
    },
    {
      "id": "typeOnPath",
      "en": "Type on a Path Tool",
      "label": "Outil Texte curviligne",
      "shortcut": null,
      "svg": "dc-type-path"
    },
    {
      "id": "verticalType",
      "en": "Vertical Type Tool",
      "label": "Outil Texte vertical",
      "shortcut": null,
      "svg": "dc-type-vertical"
    },
    {
      "id": "verticalAreaType",
      "en": "Vertical Area Type Tool",
      "label": "Outil Texte captif vertical",
      "shortcut": null,
      "svg": "dc-type-vertical"
    },
    {
      "id": "verticalTypeOnPath",
      "en": "Vertical Type on a Path Tool",
      "label": "Outil Texte curviligne vertical",
      "shortcut": null,
      "svg": "dc-type-path"
    },
    {
      "id": "touchType",
      "en": "Touch Type Tool",
      "label": "Outil Retouche de texte",
      "shortcut": "Shift+T",
      "svg": "dc-touch-type"
    }
  ],
  [
    {
      "id": "lineSegment",
      "en": "Line Segment Tool",
      "label": "Outil Trait",
      "shortcut": "\\\\",
      "svg": "dc-line"
    },
    {
      "id": "arc",
      "en": "Arc Tool",
      "label": "Outil Arc",
      "shortcut": null,
      "svg": "dc-arc"
    },
    {
      "id": "spiral",
      "en": "Spiral Tool",
      "label": "Outil Spirale",
      "shortcut": null,
      "svg": "tornado"
    },
    {
      "id": "rectangularGrid",
      "en": "Rectangular Grid Tool",
      "label": "Outil Grille rectangulaire",
      "shortcut": null,
      "svg": "dc-rect-grid"
    },
    {
      "id": "polarGrid",
      "en": "Polar Grid Tool",
      "label": "Outil Grille à coordonnées polaires",
      "shortcut": null,
      "svg": "dc-polar-grid"
    }
  ],
  [
    {
      "id": "rectangle",
      "en": "Rectangle Tool",
      "label": "Outil Rectangle",
      "shortcut": "M",
      "svg": "square"
    },
    {
      "id": "roundedRectangle",
      "en": "Rounded Rectangle Tool",
      "label": "Outil Rectangle arrondi",
      "shortcut": null,
      "svg": "dc-rounded-rect"
    },
    {
      "id": "ellipse",
      "en": "Ellipse Tool",
      "label": "Outil Ellipse",
      "shortcut": "L",
      "svg": "dc-ellipse"
    },
    {
      "id": "polygon",
      "en": "Polygon Tool",
      "label": "Outil Polygone",
      "shortcut": null,
      "svg": "dc-polygon"
    },
    {
      "id": "star",
      "en": "Star Tool",
      "label": "Outil Étoile",
      "shortcut": null,
      "svg": "star"
    },
    {
      "id": "flare",
      "en": "Flare Tool",
      "label": "Outil Halo",
      "shortcut": null,
      "svg": "dc-flare"
    }
  ],
  [
    {
      "id": "paintbrush",
      "en": "Paintbrush Tool",
      "label": "Outil Pinceau",
      "shortcut": "B",
      "svg": "paintbrush"
    },
    {
      "id": "blobBrush",
      "en": "Blob Brush Tool",
      "label": "Outil Forme de tache",
      "shortcut": "Shift+B",
      "svg": "brush"
    }
  ],
  [
    {
      "id": "shaper",
      "en": "Shaper Tool",
      "label": "Outil Shaper",
      "shortcut": "Shift+N",
      "svg": "shapes"
    },
    {
      "id": "pencil",
      "en": "Pencil Tool",
      "label": "Outil Crayon",
      "shortcut": "N",
      "svg": "pencil"
    },
    {
      "id": "smooth",
      "en": "Smooth Tool",
      "label": "Outil Arrondi",
      "shortcut": null,
      "svg": "dc-smooth"
    },
    {
      "id": "pathEraser",
      "en": "Path Eraser Tool",
      "label": "Outil Gomme de tracé",
      "shortcut": null,
      "svg": "dc-path-eraser"
    },
    {
      "id": "join",
      "en": "Join Tool",
      "label": "Outil Jonction",
      "shortcut": null,
      "svg": "dc-join"
    }
  ],
  [
    {
      "id": "eraser",
      "en": "Eraser Tool",
      "label": "Outil Gomme",
      "shortcut": "Shift+E",
      "svg": "eraser"
    },
    {
      "id": "scissors",
      "en": "Scissors Tool",
      "label": "Outil Ciseaux",
      "shortcut": "C",
      "svg": "scissors"
    },
    {
      "id": "knife",
      "en": "Knife",
      "label": "Cutter",
      "shortcut": null,
      "svg": "dc-knife"
    },
    {
      "id": "mirrorCut",
      "en": "Mirror & Cut Tool",
      "label": "Outil Symétrie et découpe",
      "shortcut": null,
      "svg": "dc-mirror-cut"
    },
    {
      "id": "lineCut",
      "en": "Line Cut Tool",
      "label": "Outil Coupe de ligne",
      "shortcut": null,
      "svg": "dc-line-cut"
    },
    {
      "id": "rectCut",
      "en": "Rectangle Cut Tool",
      "label": "Outil Découpe rectangulaire",
      "shortcut": null,
      "svg": "dc-rect-cut"
    }
  ],
  [
    {
      "id": "rotate",
      "en": "Rotate Tool",
      "label": "Outil Rotation",
      "shortcut": "R",
      "svg": "rotate-ccw"
    },
    {
      "id": "reflect",
      "en": "Reflect Tool",
      "label": "Outil Miroir",
      "shortcut": "O",
      "svg": "flip-horizontal-2"
    }
  ],
  [
    {
      "id": "scale",
      "en": "Scale Tool",
      "label": "Outil Mise à l’échelle",
      "shortcut": "S",
      "svg": "scaling"
    },
    {
      "id": "shear",
      "en": "Shear Tool",
      "label": "Outil Déformation",
      "shortcut": null,
      "svg": "dc-shear"
    },
    {
      "id": "reshape",
      "en": "Reshape Tool",
      "label": "Outil Modelage",
      "shortcut": null,
      "svg": "dc-reshape"
    }
  ],
  [
    {
      "id": "width",
      "en": "Width Tool",
      "label": "Outil Largeur",
      "shortcut": "Shift+W",
      "svg": "dc-width"
    },
    {
      "id": "warp",
      "en": "Warp Tool",
      "label": "Outil Déformation",
      "shortcut": "Shift+R",
      "svg": "waves"
    },
    {
      "id": "twirl",
      "en": "Twirl Tool",
      "label": "Outil Tourbillon",
      "shortcut": null,
      "svg": "dc-twirl"
    },
    {
      "id": "pucker",
      "en": "Pucker Tool",
      "label": "Outil Contraction",
      "shortcut": null,
      "svg": "dc-pucker"
    },
    {
      "id": "bloat",
      "en": "Bloat Tool",
      "label": "Outil Dilatation",
      "shortcut": null,
      "svg": "dc-bloat"
    },
    {
      "id": "scallop",
      "en": "Scallop Tool",
      "label": "Outil Feston",
      "shortcut": null,
      "svg": "dc-scallop"
    },
    {
      "id": "crystallize",
      "en": "Crystallize Tool",
      "label": "Outil Cristallisation",
      "shortcut": null,
      "svg": "dc-crystallize"
    },
    {
      "id": "wrinkle",
      "en": "Wrinkle Tool",
      "label": "Outil Fronces",
      "shortcut": null,
      "svg": "dc-wrinkle"
    }
  ],
  [
    {
      "id": "freeTransform",
      "en": "Free Transform Tool",
      "label": "Outil Transformation manuelle",
      "shortcut": "E",
      "svg": "dc-free-transform"
    },
    {
      "id": "puppetWarp",
      "en": "Puppet Warp Tool",
      "label": "Outil Déformation de la marionnette",
      "shortcut": null,
      "svg": "dc-puppet"
    }
  ],
  [
    {
      "id": "shapeBuilder",
      "en": "Shape Builder Tool",
      "label": "Outil Concepteur de forme",
      "shortcut": "Shift+M",
      "svg": "dc-shape-builder"
    },
    {
      "id": "livePaintBucket",
      "en": "Live Paint Bucket",
      "label": "Pot de peinture dynamique",
      "shortcut": "K",
      "svg": "dc-live-bucket"
    },
    {
      "id": "livePaintSelection",
      "en": "Live Paint Selection Tool",
      "label": "Outil Sélection de peinture dynamique",
      "shortcut": "Shift+L",
      "svg": "dc-live-select"
    }
  ],
  [
    {
      "id": "perspectiveGrid",
      "en": "Perspective Grid Tool",
      "label": "Outil Grille de perspective",
      "shortcut": "Shift+P",
      "svg": "dc-perspective"
    },
    {
      "id": "perspectiveSelection",
      "en": "Perspective Selection Tool",
      "label": "Outil Sélection d’une perspective",
      "shortcut": "Shift+V",
      "svg": "dc-perspective"
    }
  ],
  [
    {
      "id": "mesh",
      "en": "Mesh Tool",
      "label": "Outil Maillage",
      "shortcut": "U",
      "svg": "dc-mesh"
    }
  ],
  [
    {
      "id": "gradient",
      "en": "Gradient Tool",
      "label": "Outil Dégradé de couleurs",
      "shortcut": "G",
      "svg": "dc-gradient"
    }
  ],
  [
    {
      "id": "eyedropper",
      "en": "Eyedropper Tool",
      "label": "Outil Pipette",
      "shortcut": "I",
      "svg": "pipette"
    },
    {
      "id": "measure",
      "en": "Measure Tool",
      "label": "Outil Mesure",
      "shortcut": null,
      "svg": "dc-measure"
    }
  ],
  [
    {
      "id": "blend",
      "en": "Blend Tool",
      "label": "Outil Dégradé de formes",
      "shortcut": "W",
      "svg": "dc-blend"
    },
    {
      "id": "objectsOnPath",
      "en": "Objects on Path Tool",
      "label": "Outil Objets sur tracé",
      "shortcut": null,
      "svg": "dc-objects-on-path"
    }
  ],
  [
    {
      "id": "dimension",
      "en": "Dimension Tool",
      "label": "Outil Cotation",
      "shortcut": null,
      "svg": "dc-dimension"
    }
  ],
  [
    {
      "id": "symbolSprayer",
      "en": "Symbol Sprayer Tool",
      "label": "Outil Pulvérisation de symboles",
      "shortcut": "Shift+S",
      "svg": "dc-symbol-sprayer"
    },
    {
      "id": "symbolShifter",
      "en": "Symbol Shifter Tool",
      "label": "Outil Glissement de symboles",
      "shortcut": null,
      "svg": "dc-symbol-sprayer"
    },
    {
      "id": "symbolScruncher",
      "en": "Symbol Scruncher Tool",
      "label": "Outil Espacement de symboles",
      "shortcut": null,
      "svg": "dc-symbol-sprayer"
    },
    {
      "id": "symbolSizer",
      "en": "Symbol Sizer Tool",
      "label": "Outil Redimensionnement de symboles",
      "shortcut": null,
      "svg": "dc-symbol-sprayer"
    },
    {
      "id": "symbolSpinner",
      "en": "Symbol Spinner Tool",
      "label": "Outil Rotation de symboles",
      "shortcut": null,
      "svg": "dc-symbol-sprayer"
    },
    {
      "id": "symbolStainer",
      "en": "Symbol Stainer Tool",
      "label": "Outil Coloration de symboles",
      "shortcut": null,
      "svg": "dc-symbol-sprayer"
    },
    {
      "id": "symbolScreener",
      "en": "Symbol Screener Tool",
      "label": "Outil Transparence de symboles",
      "shortcut": null,
      "svg": "dc-symbol-sprayer"
    },
    {
      "id": "symbolStyler",
      "en": "Symbol Styler Tool",
      "label": "Outil Stylisation de symboles",
      "shortcut": null,
      "svg": "dc-symbol-sprayer"
    }
  ],
  [
    {
      "id": "columnGraph",
      "en": "Column Graph Tool",
      "label": "Outil Graphe à barres verticales",
      "shortcut": "J",
      "svg": "chart-column"
    },
    {
      "id": "stackedColumnGraph",
      "en": "Stacked Column Graph Tool",
      "label": "Outil Graphe à barres verticales empilées",
      "shortcut": null,
      "svg": "chart-column"
    },
    {
      "id": "barGraph",
      "en": "Bar Graph Tool",
      "label": "Outil Graphe à barres",
      "shortcut": null,
      "svg": "chart-column"
    },
    {
      "id": "stackedBarGraph",
      "en": "Stacked Bar Graph Tool",
      "label": "Outil Graphe à barres empilées",
      "shortcut": null,
      "svg": "chart-column"
    },
    {
      "id": "lineGraph",
      "en": "Line Graph Tool",
      "label": "Outil Graphe linéaire",
      "shortcut": null,
      "svg": "chart-column"
    },
    {
      "id": "areaGraph",
      "en": "Area Graph Tool",
      "label": "Outil Graphe à couches",
      "shortcut": null,
      "svg": "chart-column"
    },
    {
      "id": "scatterGraph",
      "en": "Scatter Graph Tool",
      "label": "Outil Graphe à nuage de points",
      "shortcut": null,
      "svg": "chart-column"
    },
    {
      "id": "pieGraph",
      "en": "Pie Graph Tool",
      "label": "Outil Graphe sectoriel",
      "shortcut": null,
      "svg": "chart-column"
    },
    {
      "id": "radarGraph",
      "en": "Radar Graph Tool",
      "label": "Outil Graphe radar",
      "shortcut": null,
      "svg": "chart-column"
    }
  ],
  [
    {
      "id": "artboard",
      "en": "Artboard Tool",
      "label": "Outil Plan de travail",
      "shortcut": "Shift+O",
      "svg": "frame"
    },
    {
      "id": "slice",
      "en": "Slice Tool",
      "label": "Outil Tranche",
      "shortcut": "Shift+K",
      "svg": "slice"
    },
    {
      "id": "sliceSelection",
      "en": "Slice Selection Tool",
      "label": "Outil Sélection de tranche",
      "shortcut": null,
      "svg": "slice"
    }
  ],
  [
    {
      "id": "hand",
      "en": "Hand Tool",
      "label": "Outil Main",
      "shortcut": "H",
      "svg": "hand"
    },
    {
      "id": "rotateView",
      "en": "Rotate View Tool",
      "label": "Outil Faire pivoter l’affichage",
      "shortcut": "Shift+H",
      "svg": "dc-rotate-view"
    },
    {
      "id": "printTiling",
      "en": "Print Tiling Tool",
      "label": "Outil Limites d’impression",
      "shortcut": null,
      "svg": "printer"
    }
  ],
  [
    {
      "id": "zoom",
      "en": "Zoom Tool",
      "label": "Outil Zoom",
      "shortcut": "Z",
      "svg": "zoom-in"
    }
  ]
]
