---
name: generate-diagram
description: >
  Use when the user asks to generate, create, or draw a diagram or figure for a
  project book section, mentions "drawio", "figure N", or "diagram", or when a
  draft section contains an [INSERT DIAGRAM HERE] placeholder and the user asks
  to fill it.
---

## STEP 1 — Identify the figure

If the figure number and draft section are not already clear from context, ask.

Read the paragraph in the draft that sits immediately above the `[INSERT DIAGRAM HERE]`
placeholder for that figure. Every element you see named in that paragraph must
appear in the diagram — no more, no less. This is the **faithful** test: if the
paragraph says "seven steps", the diagram has seven steps.

Derive:
- Figure number `N`
- Short kebab-case name (e.g. `indexing-pipeline`, `system-architecture`)
- Save path: `docs/drafts/figure<N>-<kebab-name>.drawio`

**Completion criterion**: you can state in one sentence what the diagram shows
and enumerate every node/group that must be present.

---

## STEP 2 — Generate and save

Build the draw.io XML and save to the derived path.

A diagram is **renderable** when it opens in draw.io with no raw HTML tag text
visible, no arrow clipping through a group header, and no arrow detouring
sideways where a straight line is intended. Apply every rule below before saving.

### XML skeleton

```xml
<mxfile host="65bd71144e">
  <diagram id="jamon-<kebab-name>" name="Figure N - <Title>">
    <mxGraphModel dx="826" dy="794" grid="0" gridSize="10" guides="1"
                  tooltips="1" connect="1" arrows="1" fold="1" page="1"
                  pageScale="1" pageWidth="1169" pageHeight="827"
                  math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <!-- bg rectangle first, then content cells -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

Background cell (always first after cell id="1"):
```xml
<mxCell id="bg" value="" style="rounded=0;fillColor=#F5F7FA;strokeColor=none;"
        parent="1" vertex="1">
  <mxGeometry width="1169" height="<H>" as="geometry"/>
</mxCell>
```

### Rule 1 — html=1 on every vertex with HTML content

Any `mxCell vertex="1"` whose `value` contains `&lt;`, `&gt;`, `&amp;`, or
`&quot;` entities MUST include `html=1;` in its `style`. Omitting it renders
the raw angle-bracket tags as literal text.

### Rule 2 — Edge routing constraints

Every edge must have:
- `edgeStyle=orthogonalEdgeStyle;html=1;`
- `exitX`, `exitY`, `exitDx=0`, `exitDy=0` to pin the source connection point
- `entryX`, `entryY`, `entryDx=0`, `entryDy=0` to pin the target connection point

### Rule 3 — Arrows exiting a group container

An arrow whose source is inside a group but whose target is outside must use
explicit `<Array as="points">` waypoints to prevent the orthogonal router from
detouring sideways through the group's free space. Provide at least one
intermediate `mxPoint` just outside the group boundary so the path is forced
straight.

### Rule 4 — Loop/retry arrows inside a group

A loop arrow (source and target both inside the same group) must route **below**
the inner nodes, never above the group header. Pattern:

```xml
<mxCell ... exitX="0.5" exitY="1" entryX="0.5" entryY="1" ...>
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="<source-center-x>" y="<loop-y>"/>
      <mxPoint x="<target-center-x>" y="<loop-y>"/>
    </Array>
  </mxGeometry>
</mxCell>
```

Where `loop-y` is inside the group's bottom clearance zone (see Rule 5).

### Rule 5 — Group container clearance

A group that contains a loop arrow must satisfy:

```
group.h  >  (bottom of tallest inner node − group.y)  +  80
```

The 80 px margin is the minimum space for a loop arc to pass cleanly below the
inner nodes. If the inner nodes are at `y=538` with `h=110` inside a group at
`y=512`, the inner-node bottoms are at `y=648`; the group must end no earlier
than `y=728`, so `h ≥ 216`.

### Color palette (consistent across all figures)

| Role                          | Stroke color |
|-------------------------------|-------------|
| Input / request               | `#6C8EBF`   |
| LLM / AI inference            | `#6B4FBB`   |
| Enrichment APIs               | `#AA6600`   |
| Vector store / PostgreSQL     | `#336791`   |
| Success path / output         | `#2E7D32`   |
| Generation / DJ step          | `#E65100`   |
| Spotify API                   | `#1DB954`   |

Group background: light tint of the group's accent color (e.g. `#E8F5E9` for
green groups, `#FFF8E1` for amber groups). All boxes: `fillColor=#FFFFFF`.

Storage/database cylinder shape: `shape=mxgraph.flowchart.database`.

### Completion criterion

File saved. Verify mentally before saving:
- [ ] Every vertex with HTML in its value has `html=1;` in its style
- [ ] Every loop arrow routes below its group's inner nodes (Rule 4)
- [ ] Every group satisfies the 80 px bottom clearance rule (Rule 5)
- [ ] Every arrow exiting a group has explicit waypoints (Rule 3)
- [ ] Node count and grouping match the paragraph exactly (faithful test)
