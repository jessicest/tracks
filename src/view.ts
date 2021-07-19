
import {
    Cell,
    Direction,
    Grid,
    Hint,
    Index,
    Link,
    LinkId,
    Pos,
    State,
    make_grid,
    make_hints
} from './grid.js';

import {
    GridSolver
} from './solver.js';

declare global {
  interface Window {
    view: View;
  }
}

export class View {
    grid: Grid;
    solver: GridSolver;
    canvas: any;
    cell_radius: number;
    link_radius: number;

    constructor(canvas: any) {
        this.cell_radius = 30;
        this.link_radius = 30;

        this.canvas = canvas;
        this.grid = make_grid(4, 4, [
                { pos: { x: 1, y: 1 }, direction: Direction.South },
                { pos: { x: 0, y: 2 }, direction: Direction.East },
                { pos: { x: 1, y: 4 }, direction: Direction.East },
                { pos: { x: 2, y: 4 }, direction: Direction.South }
            ],
            make_hints([4,3,3,2], [4,3,3,2])
        );

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

        this.solver = new GridSolver(this.grid);

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

        let thing = null;
        if(x_in_link && !y_in_link) {
            if(x > 0 && x < this.grid.xmax) {
                thing = this.grid.links.find(link =>
                                                 link.id.pos.x == x &&
                                                 link.id.pos.y == y &&
                                                 link.id.direction == Direction.East);
            }
        } else if(!x_in_link && y_in_link) {
            if(y > 0 && y < this.grid.ymax) {
                thing = this.grid.links.find(link =>
                                                 link.id.pos.x == x &&
                                                 link.id.pos.y == y &&
                                                 link.id.direction == Direction.South);
            }
        } else if(!x_in_link && !y_in_link) {
            thing = this.grid.cells.find(cell => cell.id.x == x && cell.id.y == y);
        }

        if(thing != null) {
            if(left_click && thing.state == State.Live) {
                thing.state = State.Unknown;
            } else if(left_click && thing.state == State.Unknown) {
                thing.state = State.Live;
            } else if(!left_click && thing.state == State.Dead) {
                thing.state = State.Unknown;
            } else if(!left_click && thing.state == State.Unknown) {
                thing.state = State.Dead;
            }
        }
    }

    redraw() {
        const context = this.canvas.getContext("2d");

        context.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        for(const hint of this.grid.hints) {
            this.draw_hint(context, hint);
        }

        for(const cell of this.grid.cells) {
            const x = cell.id.x;
            const y = cell.id.y;

            const px = x * (cell_diameter + link_diameter) + this.link_radius;
            const py = y * (cell_diameter + link_diameter) + this.link_radius;

            this.draw_cell(context, px, py, cell.state);
        }

        for(const link of this.grid.links) {
            const x = link.id.pos.x;
            const y = link.id.pos.y;
            const direction = link.id.direction;

            const px = x * (cell_diameter + link_diameter) + this.link_radius;
            const py = y * (cell_diameter + link_diameter) + this.link_radius;

            switch(direction) {
                case Direction.East: {
                    this.draw_link_east(context, px + cell_diameter, py, link.state);
                    break;
                }

                case Direction.South: {
                    this.draw_link_south(context, px, py + cell_diameter, link.state);
                    break;
                }
            }
        }
    }

    draw_hint(context: CanvasRenderingContext2D, hint: Hint) {
        const index = hint.id.index;

        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        const px = (hint.id.direction == Direction.East)
            ? link_diameter
            : index * (cell_diameter + link_diameter) + link_diameter;
        const py = (hint.id.direction == Direction.South)
            ? link_diameter
            : index * (cell_diameter + link_diameter) + link_diameter;

        // states of a hint can be:
        //  - violation
        //  - sated
        //  - nigh
        //  - neutral

        let num_live_cells = 0;
        let num_unknown_cells = 0;
        let num_dead_cells = 0;

        for(const cell of hint.cells) {
            switch(cell.state) {
                case State.Live: ++num_live_cells; break;
                case State.Unknown: ++num_unknown_cells; break;
                case State.Dead: ++num_dead_cells; break;
            }
        }

        const num_cells = hint.cells.length;

        let hint_color = '#000000'; // neutral
        if((num_cells - num_dead_cells) < hint.value) {
            hint_color = '#aa0000'; // violation
        } else if(num_live_cells > hint.value) {
            hint_color = '#aa0000'; // violation
        } else if(num_live_cells == hint.value && num_unknown_cells == 0) {
            hint_color = '#999999'; // satiated
        //} else if(num_live_cells == hint.value - 1) {
            //hint_color = '#44ff44'; // nigh
        }

        this.draw_hint_at(context, px, py, hint.value, hint_color);
    }

    draw_hint_at(context: CanvasRenderingContext2D, px: number, py: number, value: number, color: string) {
        context.font = '20px Tahoma';
        context.fillStyle = color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(value.toString(), px, py);
    }

    draw_cell(context: CanvasRenderingContext2D, px: number, py: number, state: State) {
        const cell_diameter = this.cell_radius * 2;

        const gradient = context.createRadialGradient(
            px + this.cell_radius,
            py + this.cell_radius,
            1,
            px + this.cell_radius,
            py + this.cell_radius,
            this.cell_radius);

        if(state != State.Dead) {
            gradient.addColorStop(0, "#8899dd");
        } else {
            gradient.addColorStop(0, "#ddeeff");
        }
        if(state != State.Live) {
            gradient.addColorStop(1, "#ddeeff");
        } else {
            gradient.addColorStop(1, "#8899dd");
        }

        context.fillStyle = gradient;
        context.fillRect(px, py, cell_diameter, cell_diameter);
    }

    draw_link_south(context: CanvasRenderingContext2D, px: number, py: number, state: State) {
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        const gradient = context.createRadialGradient(
            px + this.cell_radius,
            py + this.link_radius,
            1,
            px + this.cell_radius,
            py + this.link_radius,
            this.link_radius);

        if(state != State.Dead) {
            gradient.addColorStop(0, "#dd9988");
        } else {
            gradient.addColorStop(0, "#ffeedd");
        }
        if(state != State.Live) {
            gradient.addColorStop(1, "#ffeedd");
        } else {
            gradient.addColorStop(1, "#dd9988");
        }

        context.fillStyle = gradient;
        context.fillRect(px, py, cell_diameter, link_diameter);
    }

    draw_link_east(context: CanvasRenderingContext2D, px: number, py: number, state: State) {
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        const gradient = context.createRadialGradient(
            px + this.link_radius,
            py + this.cell_radius,
            1,
            px + this.link_radius,
            py + this.cell_radius,
            this.link_radius);

        if(state != State.Dead) {
            gradient.addColorStop(0, "#dd9988");
        } else {
            gradient.addColorStop(0, "#ffeedd");
        }
        if(state != State.Live) {
            gradient.addColorStop(1, "#ffeedd");
        } else {
            gradient.addColorStop(1, "#dd9988");
        }

        context.fillStyle = gradient;
        context.fillRect(px, py, link_diameter, cell_diameter);
    }

    solve_step() {
        for(const action of this.solver.process()) {
            action.execute(this.grid);
        }
        this.redraw();
    }
}

const canvas = document.getElementById('canvas');
window.view = new View(canvas);
