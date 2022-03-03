
import {
    Cell,
    Direction,
    Orientation,
    Grid,
    Hint,
    Id,
    Index,
    Link,
    Pos,
    make_cell_id,
    make_hints,
    make_link_id
} from './grid';

import {
    Action,
    GridState,
    Status,
    make_grid_state,
    parse_code
} from './grid_state';

export type DrawRequest = {
    id: Id,
    is_candidate: boolean,
    is_next_candidate: boolean,
};

interface Sprite {
    paint(): void;
}

class Painter {
/*

// we can create lots of little canvases

// Create a canvas element
let canvas = document.createElement('canvas');
canvas.width = 500;
canvas.height = 400;

// Get the drawing context
let ctx = canvas.getContext('2d');

// Then you can do stuff, e.g.:
ctx.fillStyle = '#f00';
ctx.fillRect(20,10,80,50);

// and then draw them instead of recreating the gradient each time
        for(const id of grid.hints.keys()) {
            this.candidates.add(id);
            this.statuses.set(id, Status.Unknown);
        }

// so basically let's memoize each drawn sprite

*/
    
}

export class View {
    grid!: Grid;
    grid_state!: GridState;
    canvas: any;
    cell_radius: number;
    link_radius: number;

    constructor(canvas: any) {
        this.canvas = canvas;
        this.cell_radius = 1;
        this.link_radius = 1;

        this.set_grid_state(make_grid_state(4, 4, [
                { pos: { x: 1, y: 1 }, direction: Direction.South },
                { pos: { x: 0, y: 2 }, direction: Direction.East },
                { pos: { x: 1, y: 4 }, direction: Direction.East },
                { pos: { x: 2, y: 4 }, direction: Direction.South }
            ],
            make_hints([4,3,3,2], [4,3,3,2])
        ));

        // resize the canvas to fill browser window dynamically
        window.addEventListener('resize', this.resize_canvas.bind(this), false);
    }

    resize_canvas() {
        this.link_radius = 400 / (3 * Math.min(this.grid.xmax, this.grid.ymax) + 9); // Fit the grid within a 400px * 400px bounding box
        this.cell_radius = this.link_radius * 2; // cell radius is double link radius
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        this.canvas.width = this.grid.xmax * (cell_diameter + link_diameter) + this.link_radius * 5 + this.cell_radius * 2;
        this.canvas.height = this.grid.ymax * (cell_diameter + link_diameter) + this.link_radius * 5 + this.cell_radius * 2;
    }

    set_grid_state(grid_state: GridState) {
        this.grid = grid_state.grid;
        this.grid_state = grid_state;
        this.resize_canvas();
    }

    event_pos(event: MouseEvent): Pos {
        return { x: event.offsetX, y: event.offsetY };
    }

    pick(pixel_pos: Pos): Id | null {
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;
        const diameter = cell_diameter + link_diameter;

        const px = pixel_pos.x;
        const py = pixel_pos.y;

        const x_in_link = px % diameter > cell_diameter;
        const y_in_link = py % diameter > cell_diameter;

        const x = Math.floor(px / diameter);
        const y = Math.floor(py / diameter);

        let id = null;
        let is_link = true;
        if(!x_in_link && !y_in_link) {
            id = make_cell_id({ x, y });
            is_link = false;
        } else if(x_in_link && !y_in_link) {
            id = make_link_id({ x, y }, Direction.East);
        } else if(!x_in_link && y_in_link) {
            id = make_link_id({ x, y }, Direction.South);
        }

        return id;
    }

    redraw(requests: Array<DrawRequest>) {
        const context = this.canvas.getContext("2d");

        for(const request of requests) {
            switch(request.id.charAt(0)) {
                case 'l': this.draw_link(context, request); break;
                case 'c': this.draw_cell(context, request); break;
                case 'h': this.draw_hint(context, request); break;
            }
        }
    }

    draw_hint(context: CanvasRenderingContext2D, request: DrawRequest) {
        const hint = this.grid.hints.get(request.id)!;
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        const px = (hint.orientation == Orientation.East)
            ? 0
            : hint.index * (cell_diameter + link_diameter);
        const py = (hint.orientation == Orientation.South)
            ? 0
            : hint.index * (cell_diameter + link_diameter);

        // states of a hint can be:
        //  - violation
        //  - sated
        //  - nigh
        //  - neutral

        const num_cells = hint.node.cells.length;
        const [live_cells, unknown_cells] = this.grid_state.split_cells(hint.node.cells);

        let text_color = '#000000'; // neutral
        let inner_color = '#ffffff'; // neutral
        let outer_color = '#ffffff'; // neutral

        if(live_cells.length + unknown_cells.length < hint.value) {
            text_color = '#aa0000'; // violation
        } else if(live_cells.length > hint.value) {
            text_color = '#aa0000'; // violation
        } else {
            if(request.is_next_candidate) {
                inner_color = '#ffaa22'; // next_candidate
            } else if(request.is_candidate) {
                inner_color = '#00aa22'; // candidate
            }

            if(live_cells.length == hint.value && unknown_cells.length == 0) {
                text_color = '#999999'; // satiated
            }
        }

        this.draw_gradient(context, px, py, this.cell_radius, this.cell_radius, inner_color, outer_color);
        this.draw_text(context, px + this.cell_radius, py + this.cell_radius, hint.value.toString(), text_color);
    }

    draw_gradient(context: CanvasRenderingContext2D, px: number, py: number, cx: number, cy: number, inner_color: string, outer_color: string) {
        const gradient = context.createRadialGradient(
            px + cx,
            py + cy,
            1,
            px + cx,
            py + cy,
            Math.min(cx, cy));

        gradient.addColorStop(0, inner_color);
        gradient.addColorStop(1, outer_color);
        context.fillStyle = gradient;
        context.fillRect(px, py, cx * 2, cy * 2);
    }

    draw_text(context: CanvasRenderingContext2D, px: number, py: number, value: string, color: string) {
        context.font = '20px Tahoma';
        context.fillStyle = color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(value, px, py);
    }

    draw_line(context: CanvasRenderingContext2D, px1: number, py1: number, px2: number, py2: number, color: string) {
        context.strokeStyle = color;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(px1, py1);
        context.lineTo(px2, py2);
        context.stroke();
    }

    draw_cell(context: CanvasRenderingContext2D, request: DrawRequest) {
        const cell = this.grid.cells.get(request.id)!;
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        const x = cell.pos.x;
        const y = cell.pos.y;

        const px = x * (cell_diameter + link_diameter);
        const py = y * (cell_diameter + link_diameter);

        const status = this.grid_state.statuses.get(request.id)!;

        let inner_color, outer_color;
        if(status == Status.Dead) {
            inner_color = "#ddeeff";
        } else if(request.is_next_candidate) {
            inner_color = "#ffaa22";
        } else if(request.is_candidate) {
            inner_color = "#00aa22";
        } else {
            inner_color = "#8899dd";
        }

        if(status != Status.Live) {
            outer_color = "#ddeeff";
        } else {
            outer_color = "#8899dd";
        }

        this.draw_gradient(context, px, py, this.cell_radius, this.cell_radius, inner_color, outer_color);
    }

    draw_link(context: CanvasRenderingContext2D, request: DrawRequest) {
        const link = this.grid.links.get(request.id)!;
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        const x = link.pos.x;
        const y = link.pos.y;
        const orientation = link.orientation;

        let px, py, cx, cy, gap;
        if(orientation == Orientation.South) {
            px = x * (cell_diameter + link_diameter);
            py = y * (cell_diameter + link_diameter) + cell_diameter;
            cx = this.cell_radius;
            cy = this.link_radius;
            gap = cx / 2;
        } else {
            px = x * (cell_diameter + link_diameter) + cell_diameter;
            py = y * (cell_diameter + link_diameter);
            cx = this.link_radius;
            cy = this.cell_radius;
            gap = cy / 2;
        }

        const status = this.grid_state.statuses.get(request.id)!;

        let inner_color, outer_color;

        if(status == Status.Dead) {
            inner_color = "#ffeedd";
        } else if(request.is_next_candidate) {
            inner_color = "#ffaa22";
        } else if(request.is_candidate) {
            inner_color = "#00aa22";
        } else {
            inner_color = "#dd9988";
        }

        if(status != Status.Live) {
            outer_color = "#ffeedd";
        } else {
            outer_color = "#dd9988";
        }

        this.draw_gradient(context, px, py, cx, cy, inner_color, outer_color);

        for(const cell of link.node.cells) {
            /*
            if(this.rule_reducer.chains.get(cell.node.id)! == this.rule_reducer.chains.get(link.node.id)!) {
                const distance = (cell.pos.y + cell.pos.x) - (link.pos.y + link.pos.x);
                const cardinal = distance + (link.orientation == Orientation.South ? 2 : 0);
                this.draw_chains(context, this.rule_reducer.chains, cardinal, px, py, cx, cy, gap, '#880000');
            }
            */
        }
    }

    // cardinal: 0 = west, 1 = east, 2 = north, 3 = south
    draw_chains(context: CanvasRenderingContext2D, chains: Map<Id, Id>, cardinal: number, px: number, py: number, cx: number, cy: number, gap: number, color: string) {
        switch(cardinal) {
            case 0: {
                this.draw_line(context, px + cx, py + cy - gap, px, py + cy - gap, color);
                this.draw_line(context, px + cx, py + cy + gap, px, py + cy + gap, color);
                break;
            }
            case 1: {
                this.draw_line(context, px + cx, py + cy - gap, px + cx + cx, py + cy - gap, color);
                this.draw_line(context, px + cx, py + cy + gap, px + cx + cx, py + cy + gap, color);
                break;
            }
            case 2: {
                this.draw_line(context, px + cx - gap, py, px + cx - gap, py + cy, color);
                this.draw_line(context, px + cx + gap, py, px + cx + gap, py + cy, color);
                break;
            }
            case 3: {
                this.draw_line(context, px + cx - gap, py + cy + cy, px + cx - gap, py + cy, color);
                this.draw_line(context, px + cx + gap, py + cy + cy, px + cx + gap, py + cy, color);
                break;
            }
            default: throw "hm.";
        }
    }
}
