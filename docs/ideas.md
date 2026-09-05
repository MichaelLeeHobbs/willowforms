# Ideas

Things worth doing if a reason turns up, and not before. Nothing here is a commitment: the specification
in [spec/README.md](spec/README.md) is where decisions live, and an idea graduates by moving there.

The point of this file is that a good idea with no evidence behind it is still a good idea tomorrow, and
building it today costs the same as building the wrong thing.

## Tooltip for supplementary information

**Trigger: a demonstrated form task needs supplementary information that visible Help text cannot reasonably provide.** There is no planned tooltip component or shared trait. Any proposal must work with keyboard, touch, and assistive technology, and must keep essential instructions available without revealing a tooltip.

## Splitting the left pane, to get palette-to-tree drops back

**Trigger: if dragging from the palette into the tree turns out to be missed.**

The tabbed left pane put Components, Tree and Settings behind tabs, which fixed a real problem — a form
with thirty components pushed the palette out of reach — and cost a real capability. A component could be
dragged from the palette straight into the tree, which is how you put something inside a container the
canvas has made hard to aim at. The two are never on screen together now. See
[spec/04-shell.md](spec/04-shell.md#tabbed-left-pane).

**The idea:** split the pane horizontally instead of tabbing it. The tree sits in the bottom half,
collapsible, with the palette above. Both visible, so the drag works again, and the tree can be folded
away when the palette needs the height.

That is a better shape than the two alternatives already considered and rejected:

- **Switching to the Tree tab when a palette drag begins.** Restores the drop, but the palette then
  vanishes after every drop, which is worse for the common case of adding three fields in a row.
- **Leaving them stacked as they were.** The original problem, unfixed.

**Why it is not built.** It is a second collapsing mechanism, on the other axis, inside a pane that
already collapses. That is three states to reason about per side and a drag target whose height changes
under the pointer. Worth it if the drop is missed. Not worth it on the theory that it might be.

**What would tell us:** wanting to put a component inside a container and finding the canvas an awkward
place to aim. If that happens more than once, build it.
