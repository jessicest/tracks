
import {
    Cell,
    Direction,
    Grid,
    Hint,
    Index,
    Link,
    Pos,
    make_cell_id,
    make_grid,
    make_hints,
    make_link_id
} from './grid.js';

import {
    Solver,
    Status,
    make_solver,
    parse_code
} from './solver.js';

declare global {
  interface Window {
    view: View;
  }
}

export class View {
    grid!: Grid;
    solver!: Solver;
    canvas: any;
    cell_radius: number;
    link_radius: number;

    constructor(canvas: any) {
        this.canvas = canvas;
        this.cell_radius = 1;
        this.link_radius = 1;
        canvas.addEventListener('click', (event: any) => {
            this.click(true, this.event_pos(event));
            event.preventDefault();
            this.redraw();
            return false;
        });
        canvas.addEventListener('contextmenu', (event: any) => {
            this.click(false, this.event_pos(event));
            event.preventDefault();
            this.redraw();
            return false;
        });

        this.set_solver(make_solver(4, 4, [
                { pos: { x: 1, y: 1 }, direction: Direction.South },
                { pos: { x: 0, y: 2 }, direction: Direction.East },
                { pos: { x: 1, y: 4 }, direction: Direction.East },
                { pos: { x: 2, y: 4 }, direction: Direction.South }
            ],
            make_hints([4,3,3,2], [4,3,3,2])
        ));

        // resize the canvas to fill browser window dynamically
        window.addEventListener('resize', window.view.resize_canvas, false);
    }

    resize_canvas() {
        this.link_radius = 420 / (3 * Math.min(this.grid.xmax, this.grid.ymax) + 9); // Fit the grid within a 420px * 420px bounding box
        this.cell_radius = this.link_radius * 2;
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        this.canvas.width = this.grid.xmax * (cell_diameter + link_diameter) + this.link_radius * 5 + this.cell_radius * 2;
        this.canvas.height = this.grid.ymax * (cell_diameter + link_diameter) + this.link_radius * 5 + this.cell_radius * 2;
    }

    set_solver(solver: Solver) {
        this.grid = solver.grid;
        this.solver = solver;
        this.resize_canvas();
        this.redraw();
    }

    event_pos(event: MouseEvent): Pos {
        return { x: event.offsetX, y: event.offsetY };
    }

    click(left_click: boolean, pixel_pos: Pos) {
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;
        const diameter = cell_diameter + link_diameter;

        const px = pixel_pos.x - this.link_radius;
        const py = pixel_pos.y - this.link_radius;

        const x_in_link = px % diameter > cell_diameter;
        const y_in_link = py % diameter > cell_diameter;

        const x = Math.floor(px / diameter);
        const y = Math.floor(py / diameter);

        let id = null;
        if(x_in_link && !y_in_link) {
            id = make_link_id({ x, y }, Direction.East);
        } else if(!x_in_link && y_in_link) {
            id = make_link_id({ x, y }, Direction.South);
        } else if(!x_in_link && !y_in_link) {
            id = make_cell_id({ x, y });
        }

        if(id != null) {
            const status = this.solver.statuses.get(id);
            if(status != null) {
                if(left_click && status == Status.Live) {
                    this.solver.statuses.set(id, Status.Unknown);
                } else if(left_click && status == Status.Unknown) {
                    this.solver.statuses.set(id, Status.Live);
                } else if(!left_click && status == Status.Dead) {
                    this.solver.statuses.set(id, Status.Unknown);
                } else if(!left_click && status == Status.Unknown) {
                    this.solver.statuses.set(id, Status.Dead);
                }
            }
        }
    }

    redraw() {
        const context = this.canvas.getContext("2d");

        context.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        for(const hint of this.grid.hints.values()) {
            this.draw_hint(context, hint);
        }

        for(const cell of this.grid.cells.values()) {
            this.draw_cell(context, cell);
        }

        for(const link of this.grid.links.values()) {
            this.draw_link(context, link);
        }
    }

    draw_hint(context: CanvasRenderingContext2D, hint: Hint) {
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        const px = (hint.direction == Direction.East)
            ? this.cell_radius
            : hint.index * (cell_diameter + link_diameter) + this.cell_radius;
        const py = (hint.direction == Direction.South)
            ? this.cell_radius
            : hint.index * (cell_diameter + link_diameter) + this.cell_radius;

        const is_candidate = this.solver.candidates.has(hint.id);

        // states of a hint can be:
        //  - violation
        //  - sated
        //  - nigh
        //  - neutral

        const num_cells = hint.cells.length;
        const [live_cells, unknown_cells, dead_cells] = this.solver.split_cells(hint.cells);

        let hint_color = '#000000'; // neutral
        if((num_cells - dead_cells.length) < hint.value) {
            hint_color = '#aa0000'; // violation
        } else if(live_cells.length > hint.value) {
            hint_color = '#aa0000'; // violation
        } else if(live_cells.length == hint.value && unknown_cells.length == 0) {
            hint_color = '#999999'; // satiated
        } else if(is_candidate) {
            hint_color = '#00aa22'; // candidate
        //} else if(live_cells.length == hint.value - 1) {
            //hint_color = '#44ff44'; // nigh
        }

        this.draw_hint_value(context, px, py, hint.value, hint_color);
    }

    draw_hint_value(context: CanvasRenderingContext2D, px: number, py: number, value: number, color: string) {
        context.font = '20px Tahoma';
        context.fillStyle = color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(value.toString(), px, py);
    }

    draw_cell(context: CanvasRenderingContext2D, cell: Cell) {
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        const x = cell.pos.x;
        const y = cell.pos.y;

        const px = x * (cell_diameter + link_diameter);
        const py = y * (cell_diameter + link_diameter);

        const status = this.solver.statuses.get(cell.id)!;
        const is_candidate = this.solver.candidates.has(cell.id);

        const gradient = context.createRadialGradient(
            px + this.cell_radius,
            py + this.cell_radius,
            1,
            px + this.cell_radius,
            py + this.cell_radius,
            this.cell_radius);

        if(status == Status.Dead) {
            gradient.addColorStop(0, "#ddeeff");
        } else if(status == Status.Unknown && is_candidate) {
            gradient.addColorStop(0, "#00aa22");
        } else {
            gradient.addColorStop(0, "#8899dd");
        }

        if(status != Status.Live) {
            gradient.addColorStop(1, "#ddeeff");
        } else {
            gradient.addColorStop(1, "#8899dd");
        }

        context.fillStyle = gradient;
        context.fillRect(px, py, cell_diameter, cell_diameter);
    }

    draw_link(context: CanvasRenderingContext2D, link: Link) {
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        const x = link.pos.x;
        const y = link.pos.y;
        const direction = link.direction;

        let px = x * (cell_diameter + link_diameter);
        let py = y * (cell_diameter + link_diameter);

        switch(direction) {
            case Direction.South: py += cell_diameter; break;
            case Direction.East: px += cell_diameter; break;
        }

        const status = this.solver.statuses.get(link.id)!;
        const is_candidate = this.solver.candidates.has(link.id);

        let gradient;
        if(direction == Direction.South) {
            gradient = context.createRadialGradient(
                px + this.cell_radius,
                py + this.link_radius,
                1,
                px + this.cell_radius,
                py + this.link_radius,
                this.link_radius);
        } else {
            gradient = context.createRadialGradient(
                px + this.link_radius,
                py + this.cell_radius,
                1,
                px + this.link_radius,
                py + this.cell_radius,
                this.link_radius);
        }

        if(status == Status.Dead) {
            gradient.addColorStop(0, "#ffeedd");
        } else if(status == Status.Unknown && is_candidate) {
            gradient.addColorStop(0, "#00aa22");
        } else {
            gradient.addColorStop(0, "#dd9988");
        }

        if(status != Status.Live) {
            gradient.addColorStop(1, "#ffeedd");
        } else {
            gradient.addColorStop(1, "#dd9988");
        }

        context.fillStyle = gradient;
        if(direction == Direction.South) {
            context.fillRect(px, py, cell_diameter, link_diameter);
        } else {
            context.fillRect(px, py, link_diameter, cell_diameter);
        }
    }

    solve_step() {
        const action = this.solver.process();
        if(action) {
            action.execute(this.solver);
            this.redraw();
        }
    }

    parse() {
        const code = (document.getElementById('code') as HTMLInputElement).value;
        this.set_solver(parse_code(code));
    }
}

const canvas = document.getElementById('canvas');
window.view = new View(canvas);
