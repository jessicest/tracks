var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
function main() {
    console.log("Hello, world!");
}
var Option = /** @class */ (function () {
    function Option() {
    }
    return Option;
}());
var Direction;
(function (Direction) {
    Direction[Direction["East"] = 0] = "East";
    Direction[Direction["South"] = 1] = "South";
})(Direction || (Direction = {}));
var Pos = /** @class */ (function () {
    function Pos(x, y) {
        this.x = x;
        this.y = y;
    }
    return Pos;
}());
function south() {
    return new Pos(this.x, this.y + 1);
}
function east() {
    return new Pos(this.x + 1, this.y);
}
function north() {
    return new Pos(this.x, this.y - 1);
}
function west() {
    return new Pos(this.x - 1, this.y);
}
var State;
(function (State) {
    State[State["Live"] = 0] = "Live";
    State[State["Unknown"] = 1] = "Unknown";
    State[State["Dead"] = 2] = "Dead";
})(State || (State = {}));
var Hint = /** @class */ (function () {
    function Hint(id, value) {
        this.id = id;
        this.value = value;
        this.cells = new Array();
        this.links = new Array();
    }
    return Hint;
}());
var Cell = /** @class */ (function () {
    function Cell(id) {
        this.id = id;
        this.hints = new Array();
        this.links = new Array();
        this.state = Unknown;
    }
    return Cell;
}());
var Link = /** @class */ (function () {
    function Link(id) {
        this.id = id;
        this.chain_id = id;
        this.hint_id = Option.none();
        this.cells = new Array();
        this.state = Unknown;
    }
    return Link;
}());
var Grid = /** @class */ (function () {
    function Grid() {
    }
    return Grid;
}());
var SetCellState = /** @class */ (function (_super) {
    __extends(SetCellState, _super);
    function SetCellState() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return SetCellState;
}(Action));
function execute(grid) {
    var cell = grid.cells.get(this.cell_id);
    cell.state = this.new_state;
    var _a = get_links(grid.links, cell.links), _ = _a[0], unknown_links = _a[1], _ = _a[2];
    for (var link in unknown_links) {
        grid.dirty_links.push(link.id);
    }
    for (var hint_id in cell.hints) {
        grid.dirty_hints.push(hint_id);
    }
}
var SetLinkState = /** @class */ (function (_super) {
    __extends(SetLinkState, _super);
    function SetLinkState() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return SetLinkState;
}(Action));
function execute(grid) {
    var link = grid.links.get(this.link_id);
    link.state = this.new_state;
    var _a = get_cells(grid.cells, link.cells), live_cells = _a[0], unknown_cells = _a[1], _ = _a[2];
    for (var cell in unknown_cells) {
        grid.dirty_cells.push(cell.id);
    }
    if (link.hint_id.is_some()) {
        grid.dirty_hints.push(link.hint_id.unwrap());
    }
    for (var cell in live_cells) {
        grid.dirty_cells.push(cell.id);
        this.propagate_chain_id(grid, cell, link.chain_id);
    }
}
// For every connected live link, set its chain id to match
function propagate_chain_id(grid, cell, chain_id) {
    var _a = get_links(grid.links, cell.links), live_links = _a[0], _ = _a[1], _ = _a[2];
    for (var link in live_links) {
        if (link.chain_id == chain_id) {
            continue;
        }
        link.chain_id = chain_id;
        grid.dirty_links.push(link.id);
        grid.dirty_cells.push(cell.id);
        for (var neighbor_id in link.cells) {
            propagate_chain_id(grid, grid.cells.get(neighbor_id), chain_id);
        }
    }
}
function process_hint(grid, hint) {
    var _a = get_cells(grid.cells, hint.cells), live_cells = _a[0], unknown_cells = _a[1], dead_cells = _a[2];
    if (unknown_cells.length > 0) {
        if (live_cells.length == hint.value) {
            return unknown_cells.map(function (cell) { return new SetCellState(cell.id, Dead); });
        }
        if (live_cells.length + unknown_cells.length == hint.value) {
            return unknown_cells.map(function (cell) { return new SetCellState(cell.id, Live); });
        }
        if (live_cells.length + unknown_cells.length == hint.value - 1) {
            var _b = get_links(grid.links, hint.links), live_links = _b[0], unknown_links = _b[1], dead_links = _b[2];
            if (unknown_links.length > 0) {
                return unknown_links.map(function (link) { return new SetLinkState(link.id, Dead); });
            }
        }
    }
    return [];
}
function process_link(grid, link) {
    var _a = get_cells(grid.cells, link.cells), live_cells = _a[0], _ = _a[1], _ = _a[2];
    var neighbor_link_ids = live_cells.flat_map( | cell | cell.links.clone());
    var _b = get_links(grid.links, neighbor_link_ids), live_neighbor_links = _b[0], _ = _b[1], _ = _b[2];
    if (live_neighbor_links.windows(2).any( | w | w[0].chain_id == w[1].chain_id)) {
        return [SetLinkState(link.id, Dead)]; // closed loop rule
    }
    return [];
}
function process_cell(grid, cell) {
    var _a = get_links(grid.links, cell.links), live_links = _a[0], unknown_links = _a[1], dead_links = _a[2];
    if (live_links.length == 1 && cell.state == Dead) {
        return [new Fail()];
    }
    if (unknown_links.length > 0) {
        if (cell.state == Dead || live_links.length == 2) {
            return unknown_links.map(function (link) { return new SetLinkState(link.id, Dead); });
        }
        if (cell.state == Live && unknown_links.length <= 2) {
            return unknown_links.map(function (link) { return new SetLinkState(link.id, Live); });
        }
    }
    if (cell.state == Unknown) {
        if (dead_links.length >= 3) {
            return [SetCellState(cell.id, Dead)];
        }
        if (live_links.length > 0) {
            return [SetCellState(cell.id, Live)];
        }
    }
    return [];
}
var GridBuilder = /** @class */ (function () {
    function GridBuilder(xmax, ymax) {
        return GridBuilder;
        {
            cells: HashMap: : new (),
                links;
            HashMap: : new (),
                hints;
            HashMap: : new (),
                xmax,
                ymax,
            ;
        }
        ;
    }
    return GridBuilder;
}());
function add_cell(pos) {
    this.cells.insert(pos, Cell, new (pos));
    this.xmax = max(this.xmax, pos.x);
    this.ymax = max(this.ymax, pos.y);
    this.try_connect_cell_with_link(pos, (pos, East));
    this.try_connect_cell_with_link(pos, (pos.west(), East));
    this.try_connect_cell_with_link(pos, (pos, South));
    this.try_connect_cell_with_link(pos, (pos.north(), South));
    this.try_connect_hint_with_cell((pos.y, East), pos);
    this.try_connect_hint_with_cell((pos.x, South), pos);
}
function add_link(link_id) {
    var _this = this;
    this.links.insert(link_id, Link, new (link_id));
    var ;
    (pos, direction) = link_id;
    this.xmax = max(this.xmax, pos.x);
    this.ymax = max(this.ymax, pos.y);
    this.try_connect_cell_with_link(pos, link_id);
    match;
    direction;
    {
        (function (East) {
            _this.try_connect_cell_with_link(pos.east(), link_id);
            _this.try_connect_hint_with_link((pos.y, East), link_id);
        },
            function (South) {
                _this.try_connect_cell_with_link(pos.south(), link_id);
                _this.try_connect_hint_with_link((pos.x, South), link_id);
            },
        );
    }
}
function add_hint(hint_id, value) {
    var _this = this;
    this.hints.insert(hint_id, Hint, new (hint_id, value));
    var ;
    (index, direction) = hint_id;
    match;
    direction;
    {
        (function (East) {
            var x = index;
            for (y in 0..(_this.ymax + 1)) {
                var pos = Pos, _a = void 0, x_1 = _a.x, y = _a.y;
                _this.try_connect_hint_with_cell(hint_id, pos);
                _this.try_connect_hint_with_link(hint_id, (pos, East));
            }
        },
            function (South) {
                var y = index;
                for (x in 0..(_this.xmax + 1)) {
                    var pos = Pos, _a = void 0, x = _a.x, y_1 = _a.y;
                    _this.try_connect_hint_with_cell(hint_id, pos);
                    _this.try_connect_hint_with_link(hint_id, (pos, South));
                }
            },
        );
    }
}
function try_connect_cell_with_link(cell_id, link_id) {
    if ()
        var Some;
    (cell) = this.cells.get_mut(cell_id);
    {
        if ()
            var Some_1;
        (link) = this.links.get_mut(link_id);
        {
            cell.links.push(link_id);
            link.cells.push(cell_id);
        }
    }
}
function try_connect_hint_with_cell(hint_id, cell_id) {
    if ()
        var Some;
    (hint) = this.hints.get_mut(hint_id);
    {
        if ()
            var Some_2;
        (cell) = this.cells.get_mut(cell_id);
        {
            hint.cells.push(cell_id);
            cell.hints.push(hint_id);
        }
    }
}
function try_connect_hint_with_link(hint_id, link_id) {
    if ()
        var Some;
    (hint) = this.hints.get_mut(hint_id);
    {
        if ()
            var Some_3;
        (link) = this.links.get_mut(link_id);
        {
            hint.links.push(link_id);
            link.hint_id = Some_3(hint_id);
        }
    }
}
function build(self) {
    Grid;
    {
        dirty_cells: this.cells.keys(),
            dirty_links;
        this.links.keys(),
            dirty_hints;
        this.hints.keys(),
            cells;
        this.cells,
            hints;
        this.hints,
            links;
        this.links,
        ;
    }
}
impl;
Grid;
{
    constructor(cx, bigint, cy, bigint, live_links, Array < (Pos, Direction) > , hints, Array(), {
        "const": zx = cx + 1,
        "const": zy = cy + 1,
        "const": builder = GridBuilder,
        // add cells
        "for": y in 1..zy
    }, {
        "for": x in 1..zx
    }, {
        "const": pos = Pos
    }, { x: x, y: y });
    builder.add_cell(pos);
}
// add links
for (y in 0..zy) {
    for (x in 0..zx) {
        var pos = Pos, _a = void 0, x = _a.x, y = _a.y;
        if (y > 0) {
            builder.add_link((pos, East));
        }
        if (x > 0) {
            builder.add_link((pos, South));
        }
    }
}
// add hints
for (index, hint;;)
     in hints.enumerate();
{
    builder.add_hint((index + 1, hint), .1), hint;
    .0;
    ;
}
// set some links Live as requested
for (link_id in live_links) {
    builder.links.get_mut(link_id).unwrap().state = Live;
}
builder.build();
function solve(self) {
    loop;
    {
        var actions = this.process();
        if (actions.is_empty()) {
            break;
        }
        for (action in actions) {
            action.execute(self);
        }
    }
}
function process(self) {
    while ()
        var Some;
    (cell_id) = this.dirty_cells.pop();
    {
        if ()
            var Some_4;
        (cell) = this.cells.get(cell_id);
        {
            var result = process_cell(cell);
            if (!result.is_empty()) {
                return result;
            }
        }
    }
    while ()
        var Some;
    (hint_id) = this.dirty_hints.pop();
    {
        if ()
            var Some_5;
        (hint) = this.hints.get(hint_id);
        {
            var result = process_hint(hint);
            if (!result.is_empty()) {
                return result;
            }
        }
    }
    while ()
        var Some;
    (link_id) = this.dirty_links.pop();
    {
        if ()
            var Some_6;
        (link) = this.links.get(link_id);
        {
            var result = process_link(link);
            if (!result.is_empty()) {
                return result;
            }
        }
    }
    return [];
}
Array < Cell > , Array();
{
    var result_1 = (new Array(), new Array(), new Array());
    for (cell_id in cell_ids) {
        if ()
            var Some;
        (cell) = cells.get(cell_id);
        {
            var target = match, cell, state, Live = (void 0).Live;
            result_1;
            .0,
                function (Unknown) { return result_1; };
            .1,
                function (Dead) { return result_1; };
            .2,
            ;
        }
        ;
        target.push(cell);
    }
}
result;
Array < Link > , Array();
{
    var result_2 = (new Array(), new Array(), new Array());
    for (link_id in link_ids) {
        if ()
            var Some;
        (link) = links.get(link_id);
        {
            var target = match, link, state, Live = (void 0).Live;
            result_2;
            .0,
                function (Unknown) { return result_2; };
            .1,
                function (Dead) { return result_2; };
            .2,
            ;
        }
        ;
        target.push(link);
    }
}
result;
function parse(input) {
    // sample:
    // 4x4:hCfA,4,3,4,S4,4,4,S3,4 
    // that's a 4x4 grid, with:
    //   top hints 4344
    //   side hints 4344
    //   A in 3rd row, curving west->south
    //   B in 4th col, curving south->north
    //   no other tracks present
    // 
    // (\d+)x(\d+):(live links),(top hints with S marked),(side hints with S marked)
    // live links seem to be 2 chars per link
    // sample:
    // 8x8:p6k9zg9a,3,3,3,5,5,5,S2,2,4,4,S2,2,4,5,5,2
    // that's with:
    //   top hints 33355522
    //   side hints 44224552
    //   A in 3rd row, curving west->north
    //   B in 7th col, curving south->east
    //   pos (3,4) also contains a south->east fragment
    // sample:
    // 4x4:l6bA,2,2,4,S4,2,2,4,S4
    // wow that's hard. live links are actually the same as in the first example
    // sample:
    // 4x4:CkAc,S4,3,3,4,S3,4,3,4
    panic("idk how to read existing track segments");
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
