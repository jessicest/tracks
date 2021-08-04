
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
export type Id = string;

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

export type CellId = Id;

export function make_cell_id(pos: Pos): CellId {
    return JSON.stringify(pos);
}

export type LinkId = Id;

export function make_link_id(pos: Pos, direction: Direction): LinkId {
    return JSON.stringify({ pos, direction });
}

export type HintId = Id;

export function make_hint_id(index: Index, direction: Direction): HintId {
    return JSON.stringify({ index, direction });
}

export type LinkContent = {
    pos: Pos,
    direction: Direction,
};

export type HintContent = {
    index: Index,
    direction: Direction,
    value: number
};

export class Hint {
    id: HintId;
    index: Index;
    direction: Direction;
    value: number;
    cells: Array<Cell>;
    links: Array<Link>;

    constructor(index: Index, direction: Direction, value: number) {
        this.id = make_hint_id(index, direction);
        this.index = index;
        this.direction = direction;
        this.value = value;
        this.cells = new Array();
        this.links = new Array();
    }
}

export class Cell {
    id: CellId;
    pos: Pos;
    hints: Array<Hint>;
    links: Array<Link>;

    constructor(pos: Pos) {
        this.id = make_cell_id(pos);
        this.pos = pos;
        this.hints = new Array();
        this.links = new Array();
    }
}

export class Link {
    id: LinkId;
    pos: Pos;
    direction: Direction;
    hint: Hint | undefined;
    cells: Array<Cell>;

    constructor(pos: Pos, direction: Direction) {
        this.id = make_link_id(pos, direction);
        this.pos = pos;
        this.direction = direction;
        this.hint = undefined;
        this.cells = new Array();
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
        const cell = new Cell(pos);
        this.cells.set(cell.id, cell);
        this.xmax = Math.max(this.xmax, pos.x);
        this.ymax = Math.max(this.ymax, pos.y);

        this.try_connect_cell_with_link(cell.id, make_link_id(pos, Direction.East));
        this.try_connect_cell_with_link(cell.id, make_link_id(west(pos), Direction.East));
        this.try_connect_cell_with_link(cell.id, make_link_id(pos, Direction.South));
        this.try_connect_cell_with_link(cell.id, make_link_id(north(pos), Direction.South));

        this.try_connect_hint_with_cell(make_hint_id(pos.y, Direction.East), cell.id);
        this.try_connect_hint_with_cell(make_hint_id(pos.x, Direction.South), cell.id);
    }

    add_link(pos: Pos, direction: Direction) {
        const link = new Link(pos, direction);
        this.links.set(link.id, link);
        this.xmax = Math.max(this.xmax, pos.x);
        this.ymax = Math.max(this.ymax, pos.y);

        this.try_connect_cell_with_link(make_cell_id(pos), link.id);
        switch(direction) {
            case Direction.East:
                this.try_connect_cell_with_link(make_cell_id(east(pos)), link.id);
                this.try_connect_hint_with_link(make_hint_id(pos.y, Direction.East), link.id);
                break;
            case Direction.South:
                this.try_connect_cell_with_link(make_cell_id(south(pos)), link.id);
                this.try_connect_hint_with_link(make_hint_id(pos.x, Direction.South), link.id);
                break;
        }
    }

    add_hint(index: Index, direction: Direction, value: number) {
        const hint = new Hint(index, direction, value);
        this.hints.set(hint.id, hint);

        switch(direction) {
            case Direction.South:
                const x = index;
                for(const y of range(this.ymax + 1)) {
                    const pos = { x, y };
                    this.try_connect_hint_with_cell(hint.id, make_cell_id(pos));
                    this.try_connect_hint_with_link(hint.id, make_link_id(pos, Direction.South));
                }
                break;
            case Direction.East:
                const y = index;
                for(const x of range(this.xmax + 1)) {
                    const pos = { x, y };
                    this.try_connect_hint_with_cell(hint.id, make_cell_id(pos));
                    this.try_connect_hint_with_link(hint.id, make_link_id(pos, Direction.East));
                }
                break;
        }
    }

    try_connect_cell_with_link(cell_id: CellId, link_id: LinkId) {
        const cell = this.cells.get(cell_id);
        const link = this.links.get(link_id);
        if(cell && link) {
            cell.links.push(link);
            link.cells.push(cell);
        }
    }

    try_connect_hint_with_cell(hint_id: HintId, cell_id: CellId) {
        const hint = this.hints.get(hint_id);
        const cell = this.cells.get(cell_id);

        if(hint && cell) {
            hint.cells.push(cell);
            cell.hints.push(hint);
        }
    }

    try_connect_hint_with_link(hint_id: HintId, link_id: LinkId) {
        const hint = this.hints.get(hint_id);
        const link = this.links.get(link_id);

        if(hint && link) {
            hint.links.push(link);
            link.hint = hint;
        }
    }

    build() : Grid {
        return new Grid(
            this.xmax,
            this.ymax,
            this.cells,
            this.links,
            this.hints);
    }
}

export class Grid {
    xmax: Index;
    ymax: Index;
    cells: Map<CellId, Cell>;
    links: Map<LinkId, Link>;
    hints: Map<HintId, Hint>;

    constructor(xmax: Index,
                ymax: Index,
                cells: Map<CellId, Cell>,
                links: Map<LinkId, Link>,
                hints: Map<HintId, Hint>) {
        this.xmax = xmax;
        this.ymax = ymax;
        this.cells = cells;
        this.links = links;
        this.hints = hints;
    }
}

export function make_hints(hints_north_south: Array<number>, hints_east_west: Array<number>): Array<HintContent> {
    const hint_contents = new Array();

    hints_north_south.forEach((value, index) => {
        hint_contents.push({ index: index + 1, direction: Direction.South, value });
    });

    hints_east_west.forEach((value, index) => {
        hint_contents.push({ index: index + 1, direction: Direction.East, value });
    });

    return hint_contents;
}

export function make_grid(cx: Index, cy: Index, live_links: Array<LinkContent>, hint_contents: Array<HintContent>): Grid {
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
    for(const y of range(1, zy)) {
        for(const x of range(1, zx)) {
            const pos = { x, y };
            builder.add_link(pos, Direction.East);
            builder.add_link(pos, Direction.South);
        }
    }

    // add any live links that are missing (this is for the offramps)
    for(const link_content of live_links) {
        if(!builder.links.get(make_link_id(link_content.pos, link_content.direction))) {
            builder.add_link(link_content.pos, link_content.direction);
        }
    }

    // add hints
    for(const hint of hint_contents) {
        builder.add_hint(hint.index, hint.direction, hint.value);
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
        hex digit (0-9, A-F): the cell's live links are encoded like so:

        #define R 1
        #define U 2
        #define L 4
        #define D 8
     */

    let links = new Array();

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

            const x = i % cx;
            const y = (i - x) / cx;

            if(n & 1) {
                // East
                links.push(make_link_id({ x: x + 1, y: y + 1 }, Direction.East));
            }

            if(n & 2) {
                // North
                links.push(make_link_id({ x: x + 1, y }, Direction.South));
            }

            if(n & 4) {
                // West
                links.push(make_link_id({ x, y: y + 1 }, Direction.East));
            }

            if(n & 8) {
                // South
                links.push(make_link_id({ x: x + 1, y: y + 1 }, Direction.South));
            }

            ++i;
        }
    }

    return links;
}

function parse_hints(cx: number, input: string) : Array<HintContent> {
    const hints_matcher = /,(S?)(\d+)/g;
    const hint_contents = new Array();

    let i = 0;
    let hint;

    while(hint = hints_matcher.exec(input)) {
        const value = parseInt(hint[2]);
        if(i < cx) {
            hint_contents.push({ index: i + 1, direction: Direction.South, value });
        } else {
            hint_contents.push({ index: i + 1 - cx, direction: Direction.East, value });
        }
        ++i;
    }

    return hint_contents;
}

export function parse_grid(input: string): Grid {
    const params_matcher = /(\d+)x(\d+):([0-9a-zA-F]+)((,S?\d+)+)/;
    const params = input.match(params_matcher)!;

    const cx = parseInt(params[1]);
    const cy = parseInt(params[2]);
    const live_links = parse_links(cx, params[3]);
    const hints = parse_hints(cx, params[4]);

    return make_grid(cx, cy, live_links, hints);
}
