//! The app's data: what app.contract's sources answer. `query` answers now, with no I/O, so the build bakes it
//! into the plan for the first frame; `answer` and `parse` add storage and requests
//! (docs/reference.md, "Rust data sources").
//!
//! The `recipes` source is a spike stub: it returns the hand-authored example
//! recipe plus a static subset of the OpenDazz library catalog
//! (`library/catalog.json` in the parent repository, 706 looks in all). The
//! real binding reads the catalog and the recipe files; it lands with the UI
//! redesign.

use exact_runner::{DataError, DataSource, Value};

#[allow(dead_code, clippy::all)]
mod shapes {
    include!(concat!(env!("OUT_DIR"), "/shapes.rs"));
}

/// (id, name) pairs: the example recipe first, then catalog entries in
/// `library/catalog.json` order.
const RECIPES: &[(&str, &str)] = &[
    ("example-faded-warm", "Faded Warm (example)"),
    ("adox/community/adox-color-implosion", "Adox Color Implosion"),
    ("adox/community/adox-silvermax-21", "Adox Silvermax 21"),
    ("agfa/community/agfa-apx-100", "Agfa APX 100"),
    ("agfa/community/agfa-apx-25", "Agfa APX 25"),
    ("agfa/community/agfa-apx-400", "Agfa APX 400"),
    ("agfa/community/agfa-optima-100", "Agfa Optima 100"),
    ("agfa/community/agfa-optima-200", "Agfa Optima 200"),
    ("agfa/community/rt-agfa-precisa-100", "Agfa Precisa 100"),
    ("agfa/community/agfa-scala-200", "Agfa Scala 200"),
    ("agfa/community/agfa-ultra-100", "Agfa Ultra 100"),
    ("agfa/community/rt-agfa-ultra-color-100", "Agfa Ultra Color 100"),
    ("agfa/community/agfa-vista-100", "Agfa Vista 100"),
    ("agfa/community/agfa-vista-200", "Agfa Vista 200"),
    ("agfa/community/agfa-vista-400", "Agfa Vista 400"),
    ("agfa/community/agfachrome-rs-100", "AgfaChrome RS 100"),
    ("bergger/community/bergger-pancro-400", "Bergger Pancro 400"),
    ("cinestill/community/cinestill-400d", "CineStill 400D"),
    ("cinestill/community/cinestill-50d", "CineStill 50D"),
    ("cinestill/community/cinestill-800t", "Cinestill 800T"),
    ("cinestill/community/cinestill-800t-video", "Cinestill 800T Video"),
    ("emulsion/community/1980s-vhs-synthwave", "1980s VHS Synthwave"),
    ("emulsion/community/albumen-print", "Albumen Print"),
    ("emulsion/community/alec-soth", "Alec Soth"),
    ("emulsion/community/alex-webb", "Alex Webb"),
    ("emulsion/community/ansel-adams-zone-system", "Ansel Adams Zone System"),
];

/// The app's data source.
#[derive(Default)]
pub struct OpenDazz;

impl DataSource for OpenDazz {
    fn query(&mut self, source: &str, _args: &[Value]) -> Result<Value, DataError> {
        match source {
            // A record's fields are positional, in the shape's declared
            // order: Recipe is (id, name).
            "recipes" => Ok(Value::list(
                RECIPES
                    .iter()
                    .map(|(id, name)| Value::record(vec![Value::str(id), Value::str(name)]))
                    .collect(),
            )),
            _ => Err(DataError::UnknownSource(source.into())),
        }
    }
}
