mod lib;

use std::io::Read;
use std::{mem, thread};
use bytes::Buf;
use byteorder::{LE, ReadBytesExt, WriteBytesExt};
use websocket::{Message, OwnedMessage};
use websocket::sync::Server;
use lib::CalcSession;

fn main() {
    let server = Server::bind("127.0.0.1:24051").unwrap();

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
                                println!("handle op_code = 1");
                                let mods = reader.read_u32::<LE>().expect("read mods");

                                let path_len = reader.read_u32::<LE>().expect("read pathlen");
                                let mut path_buf = vec![0u8; path_len as usize];
                                reader.read_exact(&mut path_buf).expect("read path");
                                let path = String::from_utf8(path_buf).expect("parse path");

                                println!("creating session for beatmap {:?}", path);
                                //mem keep
                                let leaked = Box::leak(Box::new(CalcSession::new(path, mods)));
                                let pp_curve = leaked.calc_max_combo_pp_curve(90.0, 1.0);
                                let mut response: Vec<u8> = Vec::new();

                                response.write_u8(1).expect("write opcode"); // op code
                                response.write_i64::<LE>(leaked as *const _ as i64).expect("write session mem"); // session mem address
                                let pp_curve_iter = pp_curve.iter();
                                response.write_u64::<LE>(pp_curve_iter.len() as u64).expect("write pp curve len"); // pp curve len
                                pp_curve_iter.for_each(|pp| {
                                    response.write_f64::<LE>(*pp).expect("write curve point data"); // curve point data
                                });

                                client.send_message(&Message::binary(response)).expect("send response op = 1");
                            }
                            // calculate current pp curve
                            2 => {
                                println!("handle op_code = 2");
                                let session = unsafe {
                                    let session_address = reader.read_i64::<LE>().expect("read session address");
                                    mem::transmute::<i64, &mut CalcSession>(session_address)
                                };

                                let combo_list_len = reader.read_u64::<LE>().expect("read combo list len") as usize;
                                let mut combo_list: Vec<usize> =  Vec::with_capacity(combo_list_len);

                                for i in 0..combo_list_len {
                                    combo_list.push(
                                        reader.read_u64::<LE>().unwrap_or_else(|_| panic!("read {:?}-th combo from list", i)) as usize
                                    )
                                }

                                let pp_curve = session.calc_current_pp_curve(90.0, 1.0, combo_list);
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
                                println!("handle op_code = 3");
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
                                println!("handle op_code = 4");

                                let session_address = reader.read_i64::<LE>().expect("read session address");
                                let session = unsafe { mem::transmute::<i64, &mut CalcSession>(session_address) };

                                println!("releasing calc session at {:?}", session_address);

                                unsafe { Box::from_raw(session) };

                                let mut response: Vec<u8> = Vec::new();
                                response.write_u8(4).expect("write opcode"); // op code
                                response.write_i64::<LE>(session_address).expect("write session mem"); // session mem address

                                client.send_message(&Message::binary(response)).expect("send message op = 4");

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
