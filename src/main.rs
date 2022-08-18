mod lib;

use std::io::Read;
use std::{mem, panic, thread};
use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use bytes::Buf;
use byteorder::{LE, ReadBytesExt, WriteBytesExt};
use once_cell::sync::Lazy;
use rosu_pp::parse::Pos2;
use websocket::{Message, OwnedMessage};
use websocket::sync::Server;
use lib::{CalcSession, HitFrame};

static CALC_SESSIONS: Lazy<Arc<Mutex<HashMap<String, i64>>>> = Lazy::new(|| { Arc::new(Mutex::new(HashMap::new())) });

fn main() {
    let service_addr = "127.0.0.1:24051";
    let server = Server::bind(service_addr).unwrap();

    println!("listening at {:?}", service_addr);
    for connection in server.filter_map(Result::ok) {
        thread::spawn(move || {
            let mut client = connection.accept().unwrap();
            println!("accepting connection from {:?}", client.peer_addr().unwrap().ip());
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
                                let mods = reader.read_u32::<LE>().expect("read mods");

                                let path_len = reader.read_u32::<LE>().expect("read pathlen");
                                let mut path_buf = vec![0u8; path_len as usize];
                                reader.read_exact(&mut path_buf).expect("read path");
                                let path = String::from_utf8(path_buf).expect("parse path");

                                let current_mutex = Arc::clone(&CALC_SESSIONS);
                                let mut calc_pool = current_mutex.lock().unwrap();
                                let entry = calc_pool.entry(path);
                                let session_addr = match entry {
                                    Entry::Occupied(o) => o.into_mut(),
                                    Entry::Vacant(v) => {
                                        println!("creating session for beatmap {:?}", v.key());
                                        //mem keep
                                        let leaked = Box::leak(Box::new(CalcSession::new(v.key(), mods)));
                                        v.insert(leaked as *const _ as i64)
                                    },
                                };

                                let session = unsafe { mem::transmute::<i64, &mut CalcSession>(*session_addr) };

                                let pp_curve = session.calc_max_combo_pp_curve(90.0, 1.0);
                                let mut response: Vec<u8> = Vec::new();

                                response.write_u8(1).expect("write opcode"); // op code
                                response.write_i64::<LE>(*session_addr).expect("write session mem"); // session mem address
                                let pp_curve_iter = pp_curve.iter();
                                response.write_u64::<LE>(pp_curve_iter.len() as u64).expect("write pp curve len"); // pp curve len
                                pp_curve_iter.for_each(|pp| {
                                    response.write_f64::<LE>(*pp).expect("write curve point data"); // curve point data
                                });

                                client.send_message(&Message::binary(response)).expect("send response op = 1");
                            }
                            // calculate current pp curve
                            2 => {
                                let session = unsafe {
                                    let session_address = reader.read_i64::<LE>().expect("read session address");
                                    mem::transmute::<i64, &mut CalcSession>(session_address)
                                };

                                let misses = reader.read_u64::<LE>().expect("read misses") as usize;
                                let combo_list_len = reader.read_u64::<LE>().expect("read combo list len") as usize;
                                let mut combo_list: Vec<usize> =  Vec::with_capacity(combo_list_len);

                                for i in 0..combo_list_len {
                                    let combo = reader.read_u64::<LE>().unwrap_or_else(|_| panic!("read {:?}-th combo from list", i));
                                    combo_list.push(combo as usize)
                                }

                                println!("combo List: {:?}, misses: {}", combo_list, misses);

                                let pp_curve = session.calc_current_pp_curve(90.0, 1.0, combo_list, misses);
                                let mut response: Vec<u8> = Vec::new();

                                response.write_u8(2).expect("write opcode"); // op code
                                let pp_curve_iter = pp_curve.iter();
                                response.write_u64::<LE>(pp_curve_iter.len() as u64).expect("write pp curve len"); // pp curve len
                                pp_curve_iter.for_each(|pp| {
                                    response.write_f64::<LE>(*pp).expect("write curve point data"); // curve point data
                                });

                                client.send_message(&Message::binary(response)).expect("send response op = 2");
                            }
                            // gradual diff
                            3 => {
                                let session = unsafe {
                                    let session_address = reader.read_i64::<LE>().expect("read session address");
                                    mem::transmute::<i64, &mut CalcSession>(session_address)
                                };

                                let passed_objects = reader.read_u64::<LE>().expect("read passed objects");

                                let gradual_diff = session.calc_gradual_diff(passed_objects as usize);
                                let mut response: Vec<u8> = Vec::new();

                                response.write_u8(3).expect("write opcode"); // op code
                                response.write_u64::<LE>(passed_objects).expect("write passed objects"); // passed objects
                                response.write_f64::<LE>(if let Some(gradual_diff) = gradual_diff {
                                    gradual_diff.stars()
                                } else {
                                    0f64
                                }).expect("write stars"); // current stars

                                client.send_message(&Message::binary(response)).expect("send message op = 3");
                            }
                            // release calc session
                            4 => {
                                let session_address = reader.read_i64::<LE>().expect("read session address");

                                let current_mutex = Arc::clone(&CALC_SESSIONS);
                                let mut calc_pool = current_mutex.lock().unwrap();
                                let prev_pool_size = calc_pool.len();
                                calc_pool.retain(|_, addr| *addr != session_address);

                                if prev_pool_size == calc_pool.len() + 1 {
                                    let session = unsafe { mem::transmute::<i64, &mut CalcSession>(session_address) };
                                    println!("releasing calc session at {:?}", session_address);
                                    unsafe { Box::from_raw(session) };
                                }

                                let mut response: Vec<u8> = Vec::new();
                                response.write_u8(4).expect("write opcode"); // op code
                                response.write_i64::<LE>(session_address).expect("write session mem"); // session mem address

                                client.send_message(&Message::binary(response)).expect("send message op = 4");

                            }
                            // associate heatmap
                            5 => {
                                let session = unsafe {
                                    let session_address = reader.read_i64::<LE>().expect("read session address");
                                    mem::transmute::<i64, &mut CalcSession>(session_address)
                                };

                                let frame_len = reader.read_u64::<LE>().expect("read frame len") as usize;
                                let mut frames: Vec<HitFrame> =  Vec::with_capacity(frame_len);

                                let (mut start_time, mut end_time) = (0f64, 0f64);
                                for i in 0..frame_len {
                                    let x = reader.read_f32::<LE>().unwrap_or_else(|_| panic!("read {:?}-th frame x", i));
                                    let y = reader.read_f32::<LE>().unwrap_or_else(|_| panic!("read {:?}-th frame y", i));
                                    let time = reader.read_f64::<LE>().unwrap_or_else(|_| panic!("read {:?}-th frame time", i));
                                    let k1 = reader.read_u8().unwrap_or_else(|_| panic!("read {:?}-th frame k1", i)) == 1;
                                    let k2 = reader.read_u8().unwrap_or_else(|_| panic!("read {:?}-th frame k2", i)) == 1;

                                    if i == 0 { start_time = time }
                                    if i == frame_len - 1 { end_time = time }

                                    frames.push(HitFrame { pos: Pos2 { x, y }, time, k1, k2 });
                                }

                                println!("frame length: {}, time slice: {} -> {}", frame_len, start_time, end_time);

                                let objects = session.associate_hit_object(frames.as_slice());

                                let mut response: Vec<u8> = Vec::new();
                                response.write_u8(5).expect("write opcode"); // op code

                                response.write_u64::<LE>(objects.len() as u64).expect("write hit objects len"); // hit objects len
                                for obj in objects.iter() {
                                    let circle_center = Pos2 { x: session.circle_radius, y: session.circle_radius };
                                    let relative_pos = obj.1.pos - obj.0.pos + circle_center;

                                    response.write_f32::<LE>(relative_pos.x / (session.circle_radius * 2f32)).expect("write object hit x percentage"); // hit x percentage
                                    response.write_f32::<LE>(relative_pos.y / (session.circle_radius * 2f32)).expect("write object hit y percentage"); // hit y percentage

                                    response.write_f64::<LE>(obj.1.time - obj.0.start_time).expect("write object time diff"); // hit time diff
                                }

                                client.send_message(&Message::binary(response)).expect("send message op = 5");
                            }
                            _ => { println!("unknown op code: {:?}", op_code) }
                        }
                    }
                    _ => { println!("ignoring text message.") }
                }
            }
            println!("closing connection of {:?}", client.peer_addr().unwrap().ip());
            client.shutdown().expect("shutdown exception");
        });
    }
}
