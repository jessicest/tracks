
// fun grids:
// 23x20:j9bCg5g56h6a5b5yAeCh5d6f6zyAj6i3a3p9f9g9gAn6i3j9b6ApAiAb63bCnAd5bAb5hCb3CzbAc6m6g5e5cA5zp3uCc,6,7,11,12,12,11,8,9,6,12,12,9,9,8,8,4,6,9,8,S7,11,15,18,18,21,13,11,11,11,8,7,7,14,10,10,13,14,10,9,12,S11,6,2
// 23x20:w3b5x5sAzxCAoAb9s3d6qCvA9i9n6zi5y3zs63zu6zm6a6p9i,17,15,11,9,10,8,8,4,5,5,1,2,2,S4,5,2,2,3,4,7,8,3,3,7,7,7,10,10,7,7,8,6,10,11,11,7,5,5,4,3,S5,6,2
// 23x20:q9t3tCAbCdCs55Cp95xCa6q5g5bCs9zo96y95x9fCAg5zh5zi6r9b5zzoCc,6,8,7,6,1,2,1,3,6,8,6,7,3,7,8,7,6,14,15,S19,12,9,3,6,6,9,11,12,10,14,S13,10,5,7,10,13,12,8,4,5,5,2,2

import {
    Cell,
    Direction,
    Grid,
    Hint,
    HintContent,
    Id,
    Index,
    Link,
    LinkContent,
    Node,
    NodeId,
    make_grid,
    make_hint_id,
    make_link_id,
    range
} from './grid';

export const enum Status {
    Live,
    Unknown,
    Dead,
}

export interface Action {
    execute(): Array<Id>;
}

export function output(s: string) {
    console.log(s);
}

export function reason(label: string, id: string): string {
    return label + ': ' + id;
}

export class SetStatus implements Action {
    grid_state: GridState;
    node: Node;
    new_status: Status;
    reason: string;

    constructor(grid_state: GridState, node: Node, new_status: Status, reason: string) {
        this.grid_state = grid_state;
        this.node = node;
        this.new_status = new_status;
        this.reason = reason;
    }

    execute(): Array<Id> {
        output(this.node.id + ' -> ' + this.new_status + '; ' + this.reason);
        const modified_ids = new Array();

        this.grid_state.statuses.set(this.node.id, this.new_status);

        const [live_cells, unknown_cells] = this.grid_state.split_cells(this.node.cells);
        const [_live_links, unknown_links] = this.grid_state.split_links(this.node.links);

        for(const neighbors of [[this], live_cells, unknown_cells, unknown_links, this.node.hints]) {
            for(const neighbor of neighbors) {
                modified_ids.push(neighbor.node.id);
            }
        }

        return modified_ids;
    }
}

export class Fail implements Action {
    reason: string;

    constructor(reason: string) {
        this.reason = reason;
    }

    execute(): Array<Id> {
        throw new Error("failure executed: " + this.reason);
    }
}

// for zone testing: 4x4:d4h8b,2,S2,3,3,3,S3,1,3
export type ZoneId = string;

export class Zone {
    id: ZoneId;
    progenitor_id: NodeId;
    index: number;
    link_count: number;
    status: Status;
    contents: Set<NodeId>;

    constructor(progenitor_id: NodeId, index: number) {
        this.progenitor_id = progenitor_id;
        this.index = index;
        this.id = progenitor_id + ":" + index;
        this.link_count = 0;
        this.status = Status.Unknown;
        this.contents = new Set();
    }
}

export class GridState {
    grid: Grid;
    statuses: Map<Id, Status>;

    constructor(grid: Grid, statuses: Map<Id, Status>) {
        this.grid = grid;
        this.statuses = statuses;
    }

    clone(): GridState {
        return new GridState(this.grid, new Map(this.statuses));
    }

    initialize() {
        for(const id of this.grid.cells.keys()) {
            this.statuses.set(id, Status.Unknown);
        }
        for(const id of this.grid.links.keys()) {
            this.statuses.set(id, Status.Unknown);
        }
        for(const id of this.grid.hints.keys()) {
            this.statuses.set(id, Status.Unknown);
        }
        for(const id of this.grid.permalinks) {
            this.statuses.set(id, Status.Live);
        }
    }

    // Split cells into Live, Unknown, and Dead cells
    split_cells(cells: Array<Cell>) : [Array<Cell>, Array<Cell>] {
        const result: [Array<Cell>, Array<Cell>] = [new Array(), new Array()];

        for(const cell of cells) {
            switch(this.statuses.get(cell.node.id)!) {
                case Status.Live:    result[0].push(cell); break;
                case Status.Unknown: result[1].push(cell); break;
            }
        }

        return result;
    }

    // Split links into Live, Unknown, and Dead links
    split_links(links: Array<Link>) : [Array<Link>, Array<Link>] {
        const result: [Array<Link>, Array<Link>] = [new Array(), new Array()];

        for(const link of links) {
            switch(this.statuses.get(link.node.id)!) {
                case Status.Live:    result[0].push(link); break;
                case Status.Unknown: result[1].push(link); break;
            }
        }

        return result;
    }

    encode(): string {
        return `${this.grid.xmax}x${this.grid.ymax}:${encode_links(this)}${encode_hints(this)}`;
    }
}

function encode_links(grid_state: GridState): string {
    const zx = grid_state.grid.xmax + 1;
    const zy = grid_state.grid.ymax + 1;

    let skip = 0;
    let code = '';

    for(const y of range(1, zy)) {
        for(const x of range(1, zx)) {
            let value = 0;

            const north_id = make_link_id({ x, y: y - 1 }, Direction.South);
            const north = grid_state.statuses.get(north_id) == Status.Live;

            if(north) {
                value += 2;
            }

            const east_id = make_link_id({ x, y }, Direction.East);
            const east = grid_state.statuses.get(east_id) == Status.Live;

            if(east) {
                value += 1;
            }

            const south_id = make_link_id({ x, y }, Direction.South);
            const south = grid_state.statuses.get(south_id) == Status.Live;

            if(south) {
                value += 8;
            }

            const west_id = make_link_id({ x: x - 1, y }, Direction.East);
            const west = grid_state.statuses.get(west_id) == Status.Live;

            if(west) {
                value += 4;
            }

            if(value > 0) {
                if(skip > 0) {
                    code += String.fromCharCode(skip + 96);
                }
                skip = 0;

                if(value < 10) {
                    code += String.fromCharCode(48 + value);
                } else if(value < 16) {
                    code += String.fromCharCode(55 + value);
                } else {
                    throw new Error("huh? how tho");
                }
            } else {
                ++skip;
            }
        }
    }
    if(skip > 0) {
        code += String.fromCharCode(skip + 96);
    }

    return code;
}

function encode_hints(grid_state: GridState) : string {
    let code = '';

    for(const x of range(1, grid_state.grid.xmax + 2)) {
        if(false) {
            code += "S";
        }
        code += ',';
        code += String.fromCharCode(grid_state.grid.hints.get(make_hint_id(x, Direction.South))!.value + 48);
    }

    for(const y of range(1, grid_state.grid.ymax + 2)) {
        if(false) {
            code += "S";
        }
        code += ',';
        code += String.fromCharCode(grid_state.grid.hints.get(make_hint_id(y, Direction.East))!.value + 48);
    }

    return code;
}

function parse_links(cx: number, input: string) : Array<LinkContent> {
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

    let link_contents = new Array();

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
                link_contents.push({ pos: { x: x + 1, y: y + 1 }, direction: Direction.East });
            }

            if(n & 2) {
                // North
                link_contents.push({ pos: { x: x + 1, y }, direction: Direction.South });
            }

            if(n & 4) {
                // West
                link_contents.push({ pos: { x, y: y + 1 }, direction: Direction.East });
            }

            if(n & 8) {
                // South
                link_contents.push({ pos: { x: x + 1, y: y + 1 }, direction: Direction.South });
            }

            ++i;
        }
    }

    return link_contents;
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

export function parse_code(input: string): GridState {
    const params_matcher = /(\d+)x(\d+):([0-9a-zA-F]+)((,S?\d+)+)/;
    const params = input.match(params_matcher)!;

    const cx = parseInt(params[1]);
    const cy = parseInt(params[2]);
    const live_links = parse_links(cx, params[3]);
    const hints = parse_hints(cx, params[4]);

    return make_grid_state(cx, cy, live_links, hints);
}

export function make_grid_state(cx: Index, cy: Index, live_links: Array<LinkContent>, hint_contents: Array<HintContent>): GridState {
    const grid = make_grid(cx, cy, live_links, hint_contents);
    const grid_state = new GridState(grid, new Map<Id, Status>());
    grid_state.initialize();
    return grid_state;
}

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

