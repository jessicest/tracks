
import {
    Direction,
    Grid,
    Index,
    LinkContent,
    make_hints,
    make_link_id,
    range
} from './grid';

import {
    GridState,
    make_grid_state,
} from './grid_state';

import {
    RuleReducer
} from './rule_reducer';

/*
elaborate:
 - odd/even
 - "if we light this link, we'll need to light these other ones, and a hint will over/underflow"
 - "if this cell goes dead, then the one in the corner next to it will need to be dead too"
 - "the hint says 5, we've lit 3, and we have a single and a double -- so we have to light the double not the single"
 - random guesses
*/

/*
if a row can accept only one more cross,
  and a cell in that row has only two maybe-links,
  and one of those maybe-links is in the hint,
  then the other cell in that link is Live.

odd/even:
 - starting set: every Maybe link on a Live cell.
 - discard any which can reach multiple Maybe links on that live Cell without crossing the cell.

other advanced rule:
 - when we can only just reach
*/

function to_string(grid_state: GridState): string {
    let output = '';

    const [live_cells, unknown_cells] = grid_state.split_cells(Array.from(grid_state.grid.cells.values()));
    output += 'cell counts: (' + live_cells.length + ', ' + unknown_cells.length + ', ' + grid_state.grid.cells.size + ')\n';

    const [live_links, unknown_links] = grid_state.split_links(Array.from(grid_state.grid.links.values()));
    output += 'link counts: (' + live_links.length + ', ' + unknown_links.length + ', ' + grid_state.grid.links.size + ')\n';

    return output;
}

function main() {
    function link(x: Index, y: Index, south: boolean): LinkContent {
        return { pos: { x, y }, direction: south ? Direction.South : Direction.East };
    }

    /*
    const grid = make_grid(4, 4, [
            { pos: { x: 1, y: 1 }, direction: Direction.South },
            { pos: { x: 0, y: 2 }, direction: Direction.East },
            { pos: { x: 1, y: 4 }, direction: Direction.East },
            { pos: { x: 2, y: 4 }, direction: Direction.South }
        ],
        make_hints([4,3,3,2], [4,3,3,2])
    );
    */

    // 8x8:n9a5a3g5a9k3i5hCd,7,8,8,S7,6,4,5,2,8,7,S5,6,7,5,5,4
    const grid_state = make_grid_state(8, 8, [
            link(0, 3, false),
            link(1, 3, false),
            link(1, 6, false),
            link(2, 4, false),
            link(2, 7, false),
            link(3, 3, false),
            link(3, 4, false),
            link(3, 7, false),
            link(3, 8, false),
            link(5, 4, false),
            link(7, 2, false),
            link(1, 5, true),
            link(3, 2, true),
            link(4, 8, true),
            link(5, 4, true),
            link(7, 2, true)
        ],
        make_hints([7,8,8,7,6,4,5,2], [8,7,5,6,7,5,5,4])
    );
    console.log(to_string(grid_state));

    const rule_reducer = new RuleReducer(grid_state, new Set(), new Set(), new Map(), false);
    rule_reducer.initialize();
    rule_reducer.reduce();

    console.log();
    console.log(to_string(grid_state));
}

main();
