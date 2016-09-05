
var builder = require('./build-a-demo.js');


let examples = ['blur'];

for (let example of examples) {
    const BUILDDIR = `./www/regl-pipeline-example`;
    const MAINJSSRC = `./example/${example}.js`;
    const MAINJSDST = `${example}.js`;
    const MAINHTMLFILE = `${example}.html`;
    const TITLE = `regl-pipeline "${example}" example`;

    builder.buildADemo({BUILDDIR, MAINJSSRC, MAINJSDST, MAINHTMLFILE, TITLE});
}