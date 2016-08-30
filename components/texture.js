
const clone = require('clone');

const texture = {
  inports: [{name: 'src', usage: 'static'}, {name: 'format', usage: 'static', initial: 'rgba'}, {name: 'type', usage: 'static', initial: 'uint8'},
            {name: 'width', usage: 'static'}, {name: 'height', usage: 'static'},
            {name: 'min', usage: 'static', initial: 'nearest'}, {name: 'mag', usage: 'static', initial: 'nearest'},
            {name: 'flipy', usage: 'static', initial: true}
            ],
  outports: [{name: 'out', usage: 'static', depends: ['src', 'format', 'type', 'width', 'height', 'min', 'mag', 'flipy']},
             {name: 'outviewport', usage: 'static', depends: ['width', 'height']},
             {name: 'outresolution', usage: 'static', depends: ['width', 'height']},
             {name: 'format', usage: 'static', pass: true},
             {name: 'type', usage: 'static', pass: true}
             ],

  compile: {},
  execute: {}
};

texture.execute.outviewport = function ({context}) {
  let {width, height} = context.compiled('out');

  return {x: 0, y: 0, width, height};
};

texture.execute.outresolution = function ({context}) {
  let {width, height} = context.compiled('out');
  return {width, height};
};

texture.compile.out = function ({context}) {
  return new Promise(function (resolve, reject) {
    // let type = context.evaluate('type', 'uint8');
    // let components = context.evaluate('components', 'rgba');
    // let mag = context.evaluate('mag');
    // let min = context.evaluate('min');
    // let flipY = context.evaluate('flipy');
    // let src = context.evaluate('src');

    let params = {};

    for (let prop of ['mag', 'min', 'format', 'type', 'flipY']) {
      if (!context.connected(prop.toLowerCase())) {
        continue;
      }

      params[prop] = context.statically(prop.toLowerCase());
    }

    if (!context.connected('src')) {
      let width = context.evaluate('width');
      let height = context.evaluate('height');
      params.width = width;
      params.height = height;
      let texture = context.regl.texture(params);
      return resolve({texture, width, height});
    }

    let src = context.evaluate('src');

    context.resl({
      manifest: {
        texture: {
          src: src,
          type: 'image',
          parser: (data) => {
            params.data = data;
            params.width = data.width;
            params.height = data.height;

            return context.regl.texture(params);
          }
        }
      },
      onDone: ({texture}) => {
        return resolve({texture, width: texture.width, height: texture.height});
      },
      onProgress: (progress, message) => {
      },
      onError: (err) => {
        return reject(err);
      }

    });
  });
};

texture.execute.out = function ({context}) {
  let {texture} = context.compiled();

  return texture;
};

module.exports = function () {
  return clone(texture);
};
