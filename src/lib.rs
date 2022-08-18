use std::cmp::max;
use std::panic::{catch_unwind, take_hook, set_hook};
use rosu_pp::{
    Beatmap,
    BeatmapExt,
    DifficultyAttributes,
    PerformanceAttributes
};
use rosu_pp::parse::{HitObject, HitObjectKind, Pos2};

#[derive(Debug)]
pub struct CalcSession {
    beatmap: Beatmap,
    mods: u32,
    gradual_diff: Option<Vec<DifficultyAttributes>>,
    perf: Option<PerformanceAttributes>,

    pub circle_radius: f32,
    pub hit_time_window: f64,
    flip_objects: bool,

    current_hit_object_index: usize,
    last_hit_object_index: usize,
    last_k1_pressed: bool,
    last_k2_pressed: bool
}

impl CalcSession {
    pub fn new(path: &String, mods: u32) -> Self {
        Self {
            beatmap: Beatmap::from_path(path).unwrap(),
            mods,
            gradual_diff: None,
            perf: None,
            circle_radius: 0f32,
            hit_time_window: 0f64,
            flip_objects: false,
            current_hit_object_index: 0,
            last_hit_object_index: 0,
            last_k1_pressed: false,
            last_k2_pressed: false,
        }.init_calc_factors()
    }

    fn init_calc_factors(mut self) -> Self {
        self.gradual_diff = Some(
            self.beatmap.gradual_difficulty(self.mods).collect::<Vec<DifficultyAttributes>>()
        );
        self.perf = Some(self.beatmap.pp().mods(self.mods).calculate());

        let beatmap_attr = self.beatmap.attributes().mods(self.mods).build();
        self.circle_radius = 54.42 - 4.48 * beatmap_attr.cs as f32;
        self.hit_time_window = -12f64 * beatmap_attr.od + 259.5;
        if self.mods & 16 > 0 { self.flip_objects = true };
        // find the last object which is not spinner
        for (idx, hit_object) in self.beatmap.hit_objects.iter().rev().enumerate() {
            if matches!(hit_object.kind, HitObjectKind::Spinner { .. }) { continue }
            self.last_hit_object_index = self.beatmap.hit_objects.len() - idx - 1;
            break
        }
        self
    }

    //called once
    pub fn calc_max_combo_pp_curve(&self, start_acc: f64, step: f64) -> Vec<f64> {
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
    pub fn calc_current_pp_curve(&self, start_acc: f64, step: f64, combo_list: Vec<usize>, misses: usize) -> Vec<f64> {
        let mut result = Vec::new();
        let mut current = start_acc;

        let beatmap_max_combo = self.perf.as_ref().unwrap().max_combo().unwrap();
        let mut prev_combo_total = 0;
        let mut max_combo = combo_list.first().unwrap_or(&0);

        combo_list.iter().for_each(|c| {
            prev_combo_total += *c;
            max_combo = max(c, max_combo);
        });
        let remain_max_combo = beatmap_max_combo - prev_combo_total - misses;
        max_combo = max(&remain_max_combo, max_combo);
        let passed_objs = self.beatmap.hit_objects.len() - misses;

        let mut attr = self.perf.clone().unwrap();

        while current <= 100.0 {
            let calc = self.beatmap.pp().attributes(attr)
                .combo(*max_combo)
                .passed_objects(passed_objs)
                .misses(misses);

            let prev_hook = take_hook();
            set_hook(Box::new(|_| { }));
            let attr_new = catch_unwind(|| calc.accuracy(current).calculate());
            set_hook(prev_hook);

            if let Ok(attr_new) = attr_new {
                result.push(attr_new.pp());
                attr = attr_new;
                current += step;
            } else {
                break;
            }
        }

        result
    }

    pub fn associate_hit_object<'a>(&mut self, frames: &'a [HitFrame]) -> Vec<(HitObject, &'a HitFrame)> {
        let mut hit_objects: &[HitObject];
        let mut result: Vec<(HitObject, &'a HitFrame)> = Vec::new();

        for frame in frames.iter() {
            if (!self.last_k1_pressed && frame.k1) || (!self.last_k2_pressed && frame.k2) {
                hit_objects = &self.beatmap.hit_objects[self.current_hit_object_index..self.last_hit_object_index+1];
                let mut hit_object: Option<HitObject> = None;

                // pressed after the last object, it is already at the end of the song.
                if let Some(ho) = hit_objects.last() {
                    if frame.time - ho.start_time > self.hit_time_window  { continue }
                }

                for ho in hit_objects {
                    // ignore spinner
                    if matches!(ho.kind, HitObjectKind::Spinner { .. }) {
                        self.current_hit_object_index += 1;
                        continue
                    }
                    // valid hit
                    let obj_pos = if self.flip_objects { Pos2 { x: ho.pos.x, y: 384f32 - ho.pos.y } } else { ho.pos };
                    if f64::abs(ho.start_time - frame.time) <= self.hit_time_window
                        && obj_pos.distance(frame.pos) <= self.circle_radius
                    {
                        hit_object = Some(if self.flip_objects {
                            HitObject {
                                pos: obj_pos,
                                start_time: ho.start_time,
                                kind: ho.kind.clone()
                            }
                        } else { ho.clone() });
                        self.current_hit_object_index += 1;
                        break;
                    }
                    // missed object
                    if frame.time - ho.start_time > self.hit_time_window {
                        self.current_hit_object_index += 1;
                    }
                }

                if let Some(hit_object) = hit_object {
                    result.push((hit_object, frame));
                }
            }
            self.last_k1_pressed = frame.k1;
            self.last_k2_pressed = frame.k2;
        }

        result
    }

    pub fn calc_gradual_diff(&self, n_objects: usize) -> Option<&DifficultyAttributes> {
        let gradual_diff = self.gradual_diff.as_ref().unwrap();
        gradual_diff.get(n_objects)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct HitFrame {
    pub pos: Pos2,
    pub time: f64,
    pub k1: bool,
    pub k2: bool
}

/*impl <'a> Drop for CalcSession<'a> {

}*/