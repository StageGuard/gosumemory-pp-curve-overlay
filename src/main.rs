use std::borrow::{Borrow, BorrowMut};
use std::cmp::max;
use std::io::Read;
use std::thread;
use bytes::{Buf, BufMut};
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use rosu_pp::{Beatmap, BeatmapExt, DifficultyAttributes, GradualDifficultyAttributes, GradualPerformanceAttributes, PerformanceAttributes, ScoreState};
use websocket::{Message, OwnedMessage};
use websocket::sync::Server;

struct CalcSession {
    beatmap: Beatmap,
    mods: u32,
    gradual_diff: Option<Vec<DifficultyAttributes>>,
    gradual_perf: Option<PerformanceAttributes>,
    perf: Option<PerformanceAttributes>
}

impl CalcSession {
    fn new(path: String, mods: u32) -> Self {
        Self {
            beatmap: Beatmap::from_path(path).unwrap(),
            mods,
            gradual_diff: None,
            gradual_perf: None,
            perf: None
        }.init_gradual_calc()
    }

    fn init_gradual_calc(mut self) -> Self {
        self.gradual_diff = Some(
            self.beatmap.gradual_difficulty(self.mods).collect::<Vec<DifficultyAttributes>>()
        );
        self.perf = Some(self.beatmap.pp().mods(self.mods).calculate());
        self
    }

    //called once
    fn calc_max_combo_pp_curve(&mut self, start_acc: f64, step: f64) -> Vec<f64> {
        let mut result = Vec::new();
        let mut current = start_acc;

        let mut attr = self.perf.clone().unwrap();

        while current <= 100.0 {
            let calc = self.beatmap.pp().attributes(attr);
            let attr_new = calc.accuracy(current).calculate();

            result.push(attr_new.pp());
            attr = attr_new;
            current += step;
        }

        if current - step != 100.0 {
            result.push(self.beatmap.pp().mods(self.mods).accuracy(100.0).calculate().pp());
        }

        result
    }

    //called at every tick
    fn calc_current_pp_curve(&mut self, start_acc: f64, step: f64, combo_list: Vec<usize>) -> Vec<f64> {
        let mut result = Vec::new();
        let mut current = start_acc;

        let beatmap_max_combo = self.perf.as_ref().unwrap().max_combo().unwrap();
        let mut prev_combo_total = 0;
        let mut max_combo = combo_list.first().unwrap_or(&0);

        combo_list.iter().for_each(|c| {
            prev_combo_total += *c;
            max_combo = max(c, max_combo);
        });
        let remain_max_combo = beatmap_max_combo - prev_combo_total - combo_list.len();
        max_combo = max(&remain_max_combo, max_combo);

        let mut attr = self.beatmap.pp()
            .attributes(self.perf.clone().unwrap())
            .combo(*max_combo)
            .passed_objects(self.beatmap.hit_objects.len() - combo_list.len())
            .calculate();

        while current <= 100.0 {
            let calc = self.beatmap.pp().attributes(attr);
            let attr_new = calc.accuracy(current).calculate();

            result.push(attr_new.pp());
            attr = attr_new;
            current += step;
        }

        result
    }

    fn calc_gradual_diff(&self, n_objects: usize) -> Option<&DifficultyAttributes> {
        let gradual_diff = self.gradual_diff.as_ref().unwrap();
        gradual_diff.get(n_objects)
    }
}

/*impl <'a> Drop for CalcSession<'a> {

}*/

fn main() {
    let server = Server::bind("127.0.0.1:24051").unwrap();

    for connection in server.filter_map(Result::ok) {
        thread::spawn(move || {
            let mut client = connection.accept().unwrap();
            let mut close = false;

            while !close {
                let message = client.recv_message().unwrap();

                match message {
                    OwnedMessage::Close(_) => { close = true }
                    OwnedMessage::Ping(_) | OwnedMessage::Pong(_) => { }
                    OwnedMessage::Binary(data) => {
                        let mut reader = data.reader();

                        let op_code = reader.read_u8().expect("read opcode");

                        match op_code {
                            // create beatmap and
                            // return pp curve of max combo and session id
                            1 => {
                                println!("handle op_code = 1");
                                let mods = reader.read_u32::<LittleEndian>().expect("read mods");

                                let path_len = reader.read_u32::<LittleEndian>().expect("read pathlen");
                                let mut path_buf = vec![0u8; path_len as usize];
                                reader.read_exact(&mut path_buf).expect("read path");
                                let path = String::from_utf8(path_buf).expect("parse path");

                                println!("creating session for beatmap {:?}", path);
                                //mem keep
                                let leaked = Box::leak(Box::new(CalcSession::new(path, mods)));

                                let mut response: Vec<u8> = Vec::new();

                                response.write_u8(1).expect("write opcode"); // op code
                                response.write_i64::<LittleEndian>(leaked as *const _ as i64).expect("write session mem"); // session mem address

                                let pp_curve = leaked.calc_max_combo_pp_curve(90.0, 1.0);
                                let pp_curve_iter = pp_curve.iter();
                                response.write_u32::<LittleEndian>(pp_curve_iter.len() as u32).expect("write pp curve len"); // pp curve len
                                pp_curve_iter.for_each(|pp| {
                                    response.write_f64::<LittleEndian>(*pp).expect("write curve point data"); // curve point data
                                });

                                client.send_message(&Message::binary(response)).expect("send response op=1");
                            }
                            // calculate
                            2 => {

                            }
                            _ => { println!("unknown op code: {:?}", op_code) }
                        }
                    }
                    _ => { println!("ignoring text message.") }
                }
            }
            client.shutdown().expect("shutdown exception");
        });
    }
}