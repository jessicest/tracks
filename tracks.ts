
function main() {
    console.log("Hello, world!");
}

enum Direction {
    East,
    South,
}

class Pos {
    x: bigint;
    y: bigint;
}

type HintId = [bigint, Direction];
type CellId = Pos;
type LinkId = [Pos, Direction];

enum State {
    Live,
    Unknown,
    Dead,
}

class Hint {
    id: HintId,
    value: bigint,
    cells: Array<CellId>,
    links: Array<LinkId>,

    constructor(id: HintId, value: bigint) {
        this.id = id;
        this.value = value;
        this.cells = new Array();
        this.links = new Array();
    }
}

class Cell {
    id: CellId,
    hints: Array<HintId>,
    links: Array<LinkId>,
    state: State,
}

impl Cell {
    fn new(id: CellId) -> Self {
        Cell {
            id,
            hints: Array::new(),
            links: Array::new(),
            state: Unknown,
        }
    }
}

struct Link {
    id: LinkId,
    chain_id: LinkId,
    hint_id: Option<HintId>,
    cells: Array<CellId>,
    state: State,
}

impl Link {
    fn new(id: LinkId) -> Self {
        Link {
            id,
            chain_id: id,
            hint_id: None,
            cells: Array::new(),
            state: Unknown,
        }
    }
}

enum Action {
    SetCellState(CellId, State),
    SetLinkState(LinkId, State),
    Fail,
}
use Action::*;

struct Grid {
    dirty_cells: Array<CellId>,
    dirty_links: Array<LinkId>,
    dirty_hints: Array<HintId>,
    cells: HashMap<CellId, Cell>,
    hints: HashMap<HintId, Hint>,
    links: HashMap<LinkId, Link>,
}

impl Pos {
    fn south(&self) -> Self {
        Pos {
            x: self.x,
            y: self.y + 1,
        }
    }

    fn east(&self) -> Self {
        Pos {
            x: self.x + 1,
            y: self.y,
        }
    }

    fn north(&self) -> Self {
        Pos {
            x: self.x,
            y: self.y - 1,
        }
    }

    fn west(&self) -> Self {
        Pos {
            x: self.x - 1,
            y: self.y,
        }
    }
}

impl Action {
    fn execute(&self, grid: &mut Grid) {
        match self {
            SetCellState(cell_id, state) => {
                let mut cell = grid.cells.get_mut(cell_id).unwrap();
                cell.state = *state;
                let (_, unknown_links, _) = get_links(&grid.links, &cell.links);
                for link in unknown_links {
                    grid.dirty_links.push(link.id);
                }
                for hint_id in &cell.hints {
                    grid.dirty_hints.push(*hint_id);
                }
            },
            SetLinkState(link_id, state) => {
                let mut link = grid.links.get_mut(link_id).unwrap();
                link.state = *state;
                let link = grid.links.get(link_id).unwrap();

                let (live_cells, unknown_cells, _) = get_cells(&grid.cells, &link.cells);
                for cell in unknown_cells {
                    grid.dirty_cells.push(cell.id);
                }
                if let Some(hint_id) = link.hint_id {
                    grid.dirty_hints.push(hint_id);
                }
                for cell_id in live_cells.clone().into_iter().map(|cell| cell.id).collect() {
                    grid.dirty_cells.push(cell_id);
                    if let Some(link) = grid.links.get(link_id) {
                        propagate_chain_id(grid, link.id, link.chain_id);
                    }
                }
            },
            Fail => panic!("fail not implemented yet"),
        }
    }
}

fn propagate_chain_id(grid: &mut Grid, link_id: LinkId, chain_id: LinkId) {
    let mut link_ids = vec![link_id];

    while let Some(link_id) = link_ids.pop() {
        let mut link = grid.links.get_mut(&link_id).unwrap();
        link.chain_id = chain_id;
        let (live_cells, _, _) = get_cells(&grid.cells, &link.cells);
        for cell in live_cells {
            let (live_neighbors, _, _) = get_links(&grid.links, &cell.links);
            let mut live_neighbor_ids = live_neighbors.into_iter()
                .filter(|link| link.chain_id != chain_id)
                .map(|link| link.id)
                .collect();
            link_ids.append(&mut live_neighbor_ids);
        }
    }
}

fn process_hint(grid: &Grid, hint: &Hint) -> Array<Action> {
    let (live_cells, unknown_cells, dead_cells) = get_cells(&grid.cells, &hint.cells);

    if unknown_cells.len() > 0 {
        if live_cells.len() == hint.value {
            return unknown_cells.into_iter().map(|cell| SetCellState(cell.id, Dead)).collect();
        }

        if live_cells.len() + unknown_cells.len() == hint.value {
            return unknown_cells.into_iter().map(|cell| SetCellState(cell.id, Live)).collect();
        }

        if live_cells.len() + unknown_cells.len() == hint.value - 1 {
            let (live_links, unknown_links, dead_links) = get_links(&grid.links, &hint.links);
            if unknown_links.len() > 0 {
                return unknown_links.into_iter().map(|link| SetLinkState(link.id, Dead)).collect();
            }
        }
    }

    vec![]
}

fn process_link(grid: &Grid, link: &Link) -> Array<Action> {
    let (live_cells, _, _) = get_cells(&grid.cells, &link.cells);
    let neighbor_link_ids = live_cells.into_iter().flat_map(|cell| cell.links.clone()).collect();
    let (live_neighbor_links, _, _) = get_links(&grid.links, &neighbor_link_ids);

    if live_neighbor_links.windows(2).any(|w| w[0].chain_id == w[1].chain_id) {
        return vec![SetLinkState(link.id, Dead)]; // closed loop rule
    }

    vec![]
}

fn process_cell(grid: &Grid, cell: &Cell) -> Array<Action> {
    let (live_links, unknown_links, dead_links) = get_links(&grid.links, &cell.links);

    if live_links.len() == 1 && cell.state == Dead {
        return vec![Fail];
    }

    if unknown_links.len() > 0 {
        if cell.state == Dead || live_links.len() == 2 {
            return unknown_links.into_iter().map(|link| SetLinkState(link.id, Dead)).collect();
        }

        if cell.state == Live && unknown_links.len() <= 2 {
            return unknown_links.into_iter().map(|link| SetLinkState(link.id, Live)).collect();
        }
    }

    if cell.state == Unknown {
        if dead_links.len() > 3 {
            return vec![SetCellState(cell.id, Dead)];
        }

        if live_links.len() > 0 {
            return vec![SetCellState(cell.id, Live)];
        }
    }

    vec![]
}

struct GridBuilder {
    cells: HashMap<CellId, Cell>,
    links: HashMap<LinkId, Link>,
    hints: HashMap<HintId, Hint>,
    xmax: bigint,
    ymax: bigint,
}

impl GridBuilder {
    fn new(xmax: bigint, ymax: bigint) -> Self {
        GridBuilder {
            cells: HashMap::new(),
            links: HashMap::new(),
            hints: HashMap::new(),
            xmax,
            ymax,
        }
    }

    fn add_cell(&mut self, pos: Pos) {
        self.cells.insert(pos, Cell::new(pos));
        self.xmax = max(self.xmax, pos.x);
        self.ymax = max(self.ymax, pos.y);

        self.try_connect_cell_with_link(pos, (pos, East));
        self.try_connect_cell_with_link(pos, (pos.west(), East));
        self.try_connect_cell_with_link(pos, (pos, South));
        self.try_connect_cell_with_link(pos, (pos.north(), South));

        self.try_connect_hint_with_cell((pos.y, East), pos);
        self.try_connect_hint_with_cell((pos.x, South), pos);
    }

    fn add_link(&mut self, link_id: LinkId) {
        self.links.insert(link_id, Link::new(link_id));

        let (pos, direction) = link_id;
        self.xmax = max(self.xmax, pos.x);
        self.ymax = max(self.ymax, pos.y);

        self.try_connect_cell_with_link(pos, link_id);
        match direction {
            East => {
                self.try_connect_cell_with_link(pos.east(), link_id);
                self.try_connect_hint_with_link((pos.y, East), link_id);
            },
            South => {
                self.try_connect_cell_with_link(pos.south(), link_id);
                self.try_connect_hint_with_link((pos.x, South), link_id);
            },
        }
    }

    fn add_hint(&mut self, hint_id: HintId, value: bigint) {
        self.hints.insert(hint_id, Hint::new(hint_id, value));

        let (index, direction) = hint_id;
        match direction {
            East => {
                let x = index;
                for y in 0..(self.ymax + 1) {
                    let pos = Pos { x, y };
                    self.try_connect_hint_with_cell(hint_id, pos);
                    self.try_connect_hint_with_link(hint_id, (pos, East));
                }
            },
            South => {
                let y = index;
                for x in 0..(self.xmax + 1) {
                    let pos = Pos { x, y };
                    self.try_connect_hint_with_cell(hint_id, pos);
                    self.try_connect_hint_with_link(hint_id, (pos, South));
                }
            },
        }
    }

    fn try_connect_cell_with_link(&mut self, cell_id: CellId, link_id: LinkId) {
        if let Some(cell) = self.cells.get_mut(&cell_id) {
            if let Some(link) = self.links.get_mut(&link_id) {
                cell.links.push(link_id);
                link.cells.push(cell_id);
            }
        }
    }

    fn try_connect_hint_with_cell(&mut self, hint_id: HintId, cell_id: CellId) {
        if let Some(hint) = self.hints.get_mut(&hint_id) {
            if let Some(cell) = self.cells.get_mut(&cell_id) {
                hint.cells.push(cell_id);
                cell.hints.push(hint_id);
            }
        }
    }

    fn try_connect_hint_with_link(&mut self, hint_id: HintId, link_id: LinkId) {
        if let Some(hint) = self.hints.get_mut(&hint_id) {
            if let Some(link) = self.links.get_mut(&link_id) {
                hint.links.push(link_id);
                link.hint_id = Some(hint_id);
            }
        }
    }

    fn build(self) -> Grid {
        Grid {
            dirty_cells: self.cells.keys().map(|id| *id).collect(),
            dirty_links: self.links.keys().map(|id| *id).collect(),
            dirty_hints: self.hints.keys().map(|id| *id).collect(),
            cells: self.cells,
            hints: self.hints,
            links: self.links,
        }
    }
}

impl Grid {
    fn new(cx: bigint, cy: bigint, live_links: Array<(Pos, Direction)>, hints: Array<(bigint, Direction)>) -> Self {
        let zx = cx + 1;
        let zy = cy + 1;

        let mut builder = GridBuilder::new(cx, cy);

        // add cells
        for y in 1..zy {
            for x in 1..zx {
                let pos = Pos { x, y };
                builder.add_cell(pos);
            }
        }

        // add links
        for y in 0..zy {
            for x in 0..zx {
                let pos = Pos { x, y };

                if y > 0 {
                    builder.add_link((pos, East));
                }

                if x > 0 {
                    builder.add_link((pos, South));
                }
            }
        }

        // add hints
        for (index, hint) in hints.into_iter().enumerate() {
            builder.add_hint((index + 1, hint.1), hint.0);
        }

        // set some links Live as requested
        for link_id in live_links {
            builder.links.get_mut(&link_id).unwrap().state = Live;
        }

        builder.build()
    }

    fn solve(&mut self) {
        loop {
            let actions = self.process();
            if actions.is_empty() {
                break;
            }

            for action in actions {
                action.execute(self);
            }
        }
    }

    fn process(&mut self) -> Array<Action> {
        while let Some(cell_id) = self.dirty_cells.pop() {
            if let Some(cell) = self.cells.get(&cell_id) {
                let result = process_cell(&self, cell);
                if !result.is_empty() {
                    return result;
                }
            }
        }

        while let Some(hint_id) = self.dirty_hints.pop() {
            if let Some(hint) = self.hints.get(&hint_id) {
                let result = process_hint(&self, hint);
                if !result.is_empty() {
                    return result;
                }
            }
        }

        while let Some(link_id) = self.dirty_links.pop() {
            if let Some(link) = self.links.get(&link_id) {
                let result = process_link(&self, link);
                if !result.is_empty() {
                    return result;
                }
            }
        }

        vec![]
    }
}

fn get_cells<'a>(cells: &'a HashMap<CellId, Cell>, cell_ids: &Array<CellId>) -> (Array<&'a Cell>, Array<&'a Cell>, Array<&'a Cell>) {
    let mut result = (Array::new(), Array::new(), Array::new());

    for cell_id in cell_ids {
        if let Some(cell) = cells.get(&cell_id) {
            let mut target = match cell.state {
                Live => &mut result.0,
                Unknown => &mut result.1,
                Dead => &mut result.2,
            };

            target.push(cell);
        }
    }

    result
}

fn get_links<'a>(links: &'a HashMap<LinkId, Link>, link_ids: &Array<LinkId>) -> (Array<&'a Link>, Array<&'a Link>, Array<&'a Link>) {
    let mut result = (Array::new(), Array::new(), Array::new());

    for link_id in link_ids {
        if let Some(link) = links.get(&link_id) {
            let mut target = match link.state {
                Live => &mut result.0,
                Unknown => &mut result.1,
                Dead => &mut result.2,
            };

            target.push(link);
        }
    }

    result
}


fn parse(input: &str) -> Grid {
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

    panic!("idk how to read existing track segments")
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
