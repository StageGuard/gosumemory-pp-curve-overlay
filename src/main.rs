use std::thread;
use bytes::Buf;
use byteorder::ReadBytesExt;
use rosu_pp::{Beatmap, BeatmapExt, GradualDifficultyAttributes, GradualPerformanceAttributes, PerformanceAttributes};
use websocket::{Message, OwnedMessage};
use websocket::sync::Server;

struct CalcSession<'a> {
    beatmap: Beatmap,
    mods: u32,
    gradual_diff: Option<GradualDifficultyAttributes<'a>>,
    gradual_perf: Option<GradualPerformanceAttributes<'a>>,
    perf: Option<PerformanceAttributes>
}

impl<'a> CalcSession<'a> {
    fn new(path: String, mods: u32) -> Self {
        let mut r = Self {
            beatmap: Beatmap::from_path(path).unwrap(),
            mods,
            gradual_diff: None,
            gradual_perf: None,
            perf: None
        };

        r.init_gradual_calc();

        r
    }

    fn init_gradual_calc(&mut self) {

        self.gradual_diff = Some(self.beatmap.gradual_difficulty(self.mods));
        self.gradual_perf = Some(self.beatmap.gradual_performance(self.mods));
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

                            }
                            _ => {}
                        }
                    }
                    _ => {}
                }
            }
            client.shutdown().expect("shutdown exception");
        });
    }
}
