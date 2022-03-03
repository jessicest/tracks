
import {
    Direction,
    make_hints
} from '../src/grid';

import {
    GridState,
    make_grid_state,
    parse_code
} from '../src/grid_state';

it('should do nothing', () => {
    const grid_state = make_grid_state(4, 4, [
            { pos: { x: 1, y: 1 }, direction: Direction.South },
            { pos: { x: 0, y: 2 }, direction: Direction.East },
            { pos: { x: 1, y: 4 }, direction: Direction.East },
            { pos: { x: 2, y: 4 }, direction: Direction.South }
        ],
        make_hints([4,3,3,2], [4,3,3,2])
    );

    expect(true).toEqual(false);
});
