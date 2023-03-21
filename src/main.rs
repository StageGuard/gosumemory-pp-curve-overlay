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

fn resolve_request(data: Vec<u8>) -> Option<Vec<u8>> {
    let mut reader = data.reader();

    let op_code = reader.read_u8().expect("read opcode");

    match op_code {
        // create calc session
        0 => {
            let mods = reader.read_u32::<LE>().expect("read mods");

            let path_len = reader.read_u32::<LE>().expect("read pathlen");
            let mut path_buf = vec![0u8; path_len as usize];
            reader.read_exact(&mut path_buf).expect("read path");
            let path = String::from_utf8(path_buf).expect("parse path");

            let current_mutex = Arc::clone(&CALC_SESSIONS);
            let mut calc_pool = current_mutex.lock().unwrap();
            let entry = calc_pool.entry(path);
            let session_addr = match entry {
                Entry::Occupied(o) => {
                    println!("use existing session at 0x{:x}.", o.get());
                    o.into_mut()
                },
                Entry::Vacant(v) => {
                    //mem keep
                    let leaked = Box::leak(Box::new(CalcSession::new(v.key(), mods)));
                    let addr = leaked as *const _ as i64;
                    
                    let beatmap_name = v.key().split('\\').last().expect("get file name of beatmap");
                    println!("creating session for beatmap {:?} at 0x{:x}.", beatmap_name, addr);
                    
                    v.insert(addr)
                },
            };

            let mut response: Vec<u8> = Vec::new();

            response.write_u8(op_code).expect("write opcode"); // op code
            response.write_i64::<LE>(*session_addr).expect("write session mem"); // session mem address

            Some(response)
        }
        // release calc session
        1 => {
            let session_address = reader.read_i64::<LE>().expect("read session address");

            let current_mutex = Arc::clone(&CALC_SESSIONS);
            let mut calc_pool = current_mutex.lock().unwrap();
            let prev_pool_size = calc_pool.len();
            calc_pool.retain(|_, addr| *addr != session_address);

            if prev_pool_size == calc_pool.len() + 1 {
                let session = unsafe { mem::transmute::<i64, &mut CalcSession>(session_address) };
                println!("releasing calc session at 0x{:x}.", session_address);
                unsafe { Box::from_raw(session) };
            } else {
                println!("session at 0x{:x} is already released.", session_address);
            }

            let mut response: Vec<u8> = Vec::new();
            response.write_u8(op_code).expect("write opcode"); // op code
            response.write_i64::<LE>(session_address).expect("write session mem"); // session mem address

            Some(response)
        }
        // calculate pp curve of max combo
        2 => {
            let session = unsafe {
                let session_address = reader.read_i64::<LE>().expect("read session address");
                mem::transmute::<i64, &mut CalcSession>(session_address)
            };

            let pp_curve = session.calc_max_combo_pp_curve(90.0, 1.0);

            println!("max combo pp curve range: {} -> {}.",
                     pp_curve.first().expect("get first elem of max combo pp curve"),
                     pp_curve.last().expect("get first elem of max combo pp curve"),
            );

            let mut response: Vec<u8> = Vec::new();

            response.write_u8(op_code).expect("write opcode"); // op code
            let pp_curve_iter = pp_curve.iter();
            response.write_u64::<LE>(pp_curve_iter.len() as u64).expect("write pp curve len"); // pp curve len
            pp_curve_iter.for_each(|pp| {
                response.write_f64::<LE>(*pp).expect("write curve point data"); // curve point data
            });

            Some(response)
        }
        // calculate current pp curve
        3 => {
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

            let debug_msg = format!("combo List: {:?}, misses: {}", combo_list, misses);

            let pp_curve = session.calc_current_pp_curve(90.0, 1.0, combo_list, misses);

            println!("current pp curve range: {} -> {}, {}.",
                     pp_curve.first().expect("get first elem of max combo pp curve"),
                     pp_curve.last().expect("get first elem of max combo pp curve"),
                     debug_msg
            );

            let mut response: Vec<u8> = Vec::new();

            response.write_u8(op_code).expect("write opcode"); // op code
            let pp_curve_iter = pp_curve.iter();
            response.write_u64::<LE>(pp_curve_iter.len() as u64).expect("write pp curve len"); // pp curve len
            pp_curve_iter.for_each(|pp| {
                response.write_f64::<LE>(*pp).expect("write curve point data"); // curve point data
            });

            Some(response)
        }
        // gradual diff
        4 => {
            let session = unsafe {
                let session_address = reader.read_i64::<LE>().expect("read session address");
                mem::transmute::<i64, &mut CalcSession>(session_address)
            };

            let passed_objects = reader.read_u64::<LE>().expect("read passed objects");

            let gradual_diff = session.calc_gradual_diff(passed_objects as usize);
            let mut response: Vec<u8> = Vec::new();

            response.write_u8(op_code).expect("write opcode"); // op code
            response.write_u64::<LE>(passed_objects).expect("write passed objects"); // passed objects
            response.write_f64::<LE>(if let Some(gradual_diff) = gradual_diff {
                gradual_diff.stars()
            } else {
                0f64
            }).expect("write stars"); // current stars

            Some(response)
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

            let hits = session.associate_hit_object(frames.as_slice());

            println!("frame length: {}, time slice: {} -> {}, hit objects: {}.", frame_len, start_time, end_time, hits.len());

            let mut response: Vec<u8> = Vec::new();
            response.write_u8(op_code).expect("write opcode"); // op code

            response.write_u64::<LE>(hits.len() as u64).expect("write hit objects len"); // hit objects len
            for hit in hits.iter() {
                response.write_f32::<LE>(hit.relative_pos_x).expect("write hit x percentage"); // hit x percentage
                response.write_f32::<LE>(hit.relative_pos_y).expect("write hit y percentage"); // hit y percentage

                response.write_f64::<LE>(hit.time_diff).expect("write time diff"); // hit time diff
                response.write_u8(hit.hit_error_type).expect("write hit error type"); // hit time diff
            }

            Some(response)
        }
        _ => {
            println!("unknown op code: {:?}.", op_code);
            None
        }
    }
}

fn main() {
    let service_addr = "127.0.0.1:24051";
    let server = Server::bind(service_addr).unwrap();

    println!("listening at {:?}.", service_addr);
    for connection in server.filter_map(Result::ok) {
        thread::spawn(move || {
            let mut client = connection.accept().unwrap();
            println!("accepting connection from {:?}.", client.peer_addr().unwrap().ip());
            let mut close = false;

            while !close {
                let message = client.recv_message().unwrap();

                match message {
                    OwnedMessage::Close(_) => { close = true }
                    OwnedMessage::Ping(_) | OwnedMessage::Pong(_) => { }
                    OwnedMessage::Binary(data) => {
                        let response = resolve_request(data);

                        if let Some(r) = response {
                            client.send_message(&Message::binary(r)).expect("send message.");
                        }
                    }
                    OwnedMessage::Text(_) => { println!("ignoring text message.") }
                }
            }
            println!("closing connection of {:?}.", client.peer_addr().unwrap().ip());
            client.shutdown().expect("shutdown exception.");
        });
    }
}
