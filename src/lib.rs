use std::cmp::max;
use std::panic::catch_unwind;
use rosu_pp::{
    Beatmap,
    BeatmapExt,
    DifficultyAttributes,
    PerformanceAttributes
};

pub struct CalcSession {
    beatmap: Beatmap,
    mods: u32,
    gradual_diff: Option<Vec<DifficultyAttributes>>,
    perf: Option<PerformanceAttributes>
}

impl CalcSession {
    pub fn new(path: String, mods: u32) -> Self {
        Self {
            beatmap: Beatmap::from_path(path).unwrap(),
            mods,
            gradual_diff: None,
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

        println!("combo list: {:?}, max_combo: {:?}, passed_objects: {:?}, misses: {:?}",
                 combo_list, *max_combo, passed_objs, misses
        );

        let mut attr = self.perf.clone().unwrap();

        while current <= 100.0 {
            let calc = self.beatmap.pp().attributes(attr)
                .combo(*max_combo)
                .passed_objects(passed_objs)
                .misses(misses);
            let attr_new = catch_unwind(|| calc.accuracy(current).calculate());

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

    pub fn calc_gradual_diff(&self, n_objects: usize) -> Option<&DifficultyAttributes> {
        let gradual_diff = self.gradual_diff.as_ref().unwrap();
        gradual_diff.get(n_objects)
    }
}

/*impl <'a> Drop for CalcSession<'a> {

}*/