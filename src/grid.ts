
// generates a range of numbers from start (inclusive) to end (exclusive)
function* range(start: number, end?: number, step: number = 1) {
  if( end === undefined ) [start, end] = [0, start];
  for( let n = start; n < end; n += step ) yield n;
}

export const enum Direction {
    East,
    South,
}

export type Index = number;

export type Pos = {
    x: Index,
    y: Index
};

function south(pos: Pos) : Pos {
    return { x: pos.x, y: pos.y + 1 };
}

function east(pos: Pos) : Pos {
    return { x: pos.x + 1, y: pos.y };
}

function north(pos: Pos) : Pos {
    return { x: pos.x, y: pos.y - 1 };
}

function west(pos: Pos) : Pos {
    return { x: pos.x - 1, y: pos.y };
}

export type HintId = {
    index: Index,
    direction: Direction
};

export type HintValue = {
    id: HintId,
    value: number
};

export type CellId = Pos;

export type LinkId = {
    pos: Pos,
    direction: Direction
};

export const enum State {
    Live,
    Unknown,
    Dead,
}

export class Hint {
    id: HintId;
    value: number;
    cells: Array<Cell>;
    links: Array<Link>;

    constructor(id: HintId, value: number) {
        this.id = id;
        this.value = value;
        this.cells = new Array();
        this.links = new Array();
    }
}

export class Cell {
    id: CellId;
    hints: Array<Hint>;
    links: Array<Link>;
    state: State;

    constructor(id: CellId) {
        this.id = id;
        this.hints = new Array();
        this.links = new Array();
        this.state = State.Unknown;
    }
}

export class Link {
    id: LinkId;
    chain_id: LinkId;
    hint: Hint | undefined;
    cells: Array<Cell>;
    state: State;

    constructor(id: LinkId) {
        this.id = id;
        this.chain_id = id;
        this.hint = undefined;
        this.cells = new Array();
        this.state = State.Unknown;
    }
}

export class GridBuilder {
    cells: Map<string, Cell>;
    links: Map<string, Link>;
    hints: Map<string, Hint>;
    xmax: Index;
    ymax: Index;

    constructor(xmax: Index, ymax: Index) {
        this.cells = new Map();
        this.links = new Map();
        this.hints = new Map();
        this.xmax = xmax;
        this.ymax = ymax;
    }

    add_cell(pos: Pos) {
        this.cells.set(JSON.stringify(pos), new Cell(pos));
        this.xmax = Math.max(this.xmax, pos.x);
        this.ymax = Math.max(this.ymax, pos.y);

        this.try_connect_cell_with_link(pos, { pos, direction: Direction.East });
        this.try_connect_cell_with_link(pos, { pos: west(pos), direction: Direction.East });
        this.try_connect_cell_with_link(pos, { pos, direction: Direction.South });
        this.try_connect_cell_with_link(pos, { pos: north(pos), direction: Direction.South });

        this.try_connect_hint_with_cell({ index: pos.y, direction: Direction.East }, pos);
        this.try_connect_hint_with_cell({ index: pos.x, direction: Direction.South }, pos);
    }

    add_link(link_id: LinkId) {
        this.links.set(JSON.stringify(link_id), new Link(link_id));
        this.xmax = Math.max(this.xmax, link_id.pos.x);
        this.ymax = Math.max(this.ymax, link_id.pos.y);

        this.try_connect_cell_with_link(link_id.pos, link_id);
        switch(link_id.direction) {
            case Direction.East:
                this.try_connect_cell_with_link(east(link_id.pos), link_id);
                this.try_connect_hint_with_link({ index: link_id.pos.y, direction: Direction.East }, link_id);
                break;
            case Direction.South:
                this.try_connect_cell_with_link(south(link_id.pos), link_id);
                this.try_connect_hint_with_link({ index: link_id.pos.x, direction: Direction.South }, link_id);
                break;
        }
    }

    add_hint(hint_id: HintId, value: number) {
        this.hints.set(JSON.stringify(hint_id), new Hint(hint_id, value));

        switch(hint_id.direction) {
            case Direction.South:
                const x = hint_id.index;
                for(const y of range(this.ymax + 1)) {
                    const pos = { x, y };
                    this.try_connect_hint_with_cell(hint_id, pos);
                    this.try_connect_hint_with_link(hint_id, { pos, direction: Direction.South });
                }
                break;
            case Direction.East:
                const y = hint_id.index;
                for(const x of range(this.xmax + 1)) {
                    const pos = { x, y };
                    this.try_connect_hint_with_cell(hint_id, pos);
                    this.try_connect_hint_with_link(hint_id, { pos, direction: Direction.East });
                }
                break;
        }
    }

    try_connect_cell_with_link(cell_id: CellId, link_id: LinkId) {
        const link_key = JSON.stringify(link_id); // omg
        const cell_key = JSON.stringify(cell_id); // omg

        const cell = this.cells.get(cell_key);
        const link = this.links.get(link_key);
        if(cell && link) {
            cell.links.push(link);
            link.cells.push(cell);
        }
    }

    try_connect_hint_with_cell(hint_id: HintId, cell_id: CellId) {
        const hint_key = JSON.stringify(hint_id); // omg
        const cell_key = JSON.stringify(cell_id); // omg

        const hint = this.hints.get(hint_key);
        const cell = this.cells.get(cell_key);

        if(hint && cell) {
            hint.cells.push(cell);
            cell.hints.push(hint);
        }
    }

    try_connect_hint_with_link(hint_id: HintId, link_id: LinkId) {
        const hint_key = JSON.stringify(hint_id); // omg
        const link_key = JSON.stringify(link_id); // omg

        const hint = this.hints.get(hint_key);
        const link = this.links.get(link_key);

        if(hint && link) {
            hint.links.push(link);
            link.hint = hint;
        }
    }

    build() : Grid {
        return new Grid(
            this.xmax,
            this.ymax,
            Array.from(this.cells.values()),
            Array.from(this.links.values()),
            Array.from(this.hints.values()));
    }
}

export class Grid {
    xmax: Index;
    ymax: Index;
    dirty_cells: Set<Cell>;
    dirty_links: Set<Link>;
    dirty_hints: Set<Hint>;
    cells: Array<Cell>;
    links: Array<Link>;
    hints: Array<Hint>;

    constructor(xmax: Index,
                ymax: Index,
                cells: Array<Cell>,
                links: Array<Link>,
                hints: Array<Hint>) {
        this.xmax = xmax;
        this.ymax = ymax;
        this.dirty_cells = new Set(cells);
        this.dirty_links = new Set(links);
        this.dirty_hints = new Set(hints);
        this.cells = cells;
        this.links = links;
        this.hints = hints;
    }
}

export function make_hints(hints_north_south: Array<number>, hints_east_west: Array<number>): Array<HintValue> {
    const hints = new Array();

    hints_north_south.forEach((value, index) => {
        hints.push({ id: { index: index + 1, direction: Direction.South }, value });
    });

    hints_east_west.forEach((value, index) => {
        hints.push({ id: { index: index + 1, direction: Direction.East }, value });
    });

    return hints;
}

export function make_grid(cx: Index, cy: Index, live_links: Array<LinkId>, hints: Array<HintValue>): Grid {
    const zx = cx + 1;
    const zy = cy + 1;

    const builder = new GridBuilder(cx, cy);

    // add cells
    for(const y of range(1, zy)) {
        for(const x of range(1, zx)) {
            builder.add_cell({ x, y });
        }
    }

    // add links
    for(const y of range(zy)) {
        for(const x of range(zx)) {
            const pos = { x, y };
            if(y > 0) {
                builder.add_link({ pos, direction: Direction.East });
            }

            if(x > 0) {
                builder.add_link({ pos, direction: Direction.South });
            }
        }
    }

    // add hints
    for(const hint of hints) {
        builder.add_hint(hint.id, hint.value);
    }

    // set some links Live as requested
    for(const link_id of live_links) {
        console.dir(builder.links);
        console.dir(JSON.stringify(link_id));
        builder.links.get(JSON.stringify(link_id))!.state = State.Live;
    }

    // mark all other edge links as Dead
    for(const link of builder.links.values()) {
        if(link.state == State.Unknown && link.cells.length == 1) {
            link.state = State.Dead;
        }
    }

    return builder.build();
}

function parse_links(cx: number, input: string) : Array<LinkId> {
    /*
        4x4:h5d9b,3,S4,3,3,4,3,S4,2
        4x4:d5gAc,S3,3,3,4,3,S3,4,3
        4x4:5kAc,S4,3,4,3,S3,4,4,3
        4x4:aCj6bC,4,4,4,S4,4,4,4,S4

        lowercase letter, a-z: skip that many cells
        hex digit (0-9, A-F): the cell is encoded like so:

        #define R 1
        #define U 2
        #define L 4
        #define D 8
     */

    let links = new Array();

    console.dir("links text: " + input);

    let i = 0;
    for(const c of input) {
        const code = c.charCodeAt(0);

        if(code >= 97 && code <= 122) { // ascii 'a' to 'z'
            i += 1 + code - 97; // skip that many cells
        } else {
            let n = 0;

            if(code >= 48 && code <= 57) { // ascii '0' to '9'
                n = code - 48;
            } else if(code >= 65 && code <= 70) { // ascii 'A' to 'F'
                n = 10 + code - 65;
            } else {
                throw new Error('what');
            }

            console.dir('cell: ' + n + ' at ' + i);

            const x = i % cx;
            const y = (i - x) / cx;

            if(n & 1) {
                // East
                links.push({ pos: { x: x + 1, y: y + 1 }, direction: Direction.East });
            }

            if(n & 2) {
                // North
                links.push({ pos: { x: x + 1, y }, direction: Direction.South });
            }

            if(n & 4) {
                // West
                links.push({ pos: { x, y: y + 1 }, direction: Direction.East });
            }

            if(n & 8) {
                // South
                links.push({ pos: { x: x + 1, y: y + 1 }, direction: Direction.South });
            }

            ++i;
        }
    }

    console.dir('links: ' + JSON.stringify(links));
    return links;
}

function parse_hints(cx: number, input: string) : [Array<LinkId>, Array<HintValue>] {
    const hints_matcher = /,(S?)(\d+)/g;
    const hints = new Array();
    const links = new Array();

    console.dir("hints: " + input);

    let i = 0;
    let hint;

    while(hint = hints_matcher.exec(input)) {
        const value = parseInt(hint[2]);
        if(i < cx) {
            if(hint[1]) {
                links.push({ pos: { x: i + 1, y: 0 }, direction: Direction.South });
            }
            hints.push({ id: { index: i + 1, direction: Direction.South }, value });
        } else {
            if(hint[1]) {
                links.push({ pos: { x: 0, y: i + 1 - cx }, direction: Direction.East });
            }
            hints.push({ id: { index: i + 1 - cx, direction: Direction.East }, value });
        }
        ++i;
    }

    return [links, hints];
}

export function parse_grid(input: string): Grid {
    const params_matcher = /(\d+)x(\d+):([0-9a-zA-F]+)(,S?\d+)+/;
    const params = input.match(params_matcher)!;

    const cx = parseInt(params[1]);
    const cy = parseInt(params[2]);
    const live_links = parse_links(cx, params[3]);
    const [exits, hints] = parse_hints(cx, params[4]);

    console.dir([cx, cy, live_links, exits, hints]);

    return make_grid(cx, cy, live_links.concat(exits), hints);
}
