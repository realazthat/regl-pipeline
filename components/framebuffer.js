

const clone = require('clone');

const framebuffer = {
  inports: [
    {name: 'texture', usage: 'static'},
    {name: 'components', usage: 'static', initial: 'rgba'},
    {name: 'type', usage: 'static', initial: 'uint8'},
    {name: 'width', usage: 'static'},
    {name: 'height', usage: 'static'},
    {name: 'min', usage: 'static', initial: 'nearest'},
    {name: 'mag', usage: 'static', initial: 'nearest'},
    {name: 'wrap', usage: 'static', initial: 'clamp'}
    ],
  outports: [
    {name: 'out', depends: ['texture', 'type', 'components', 'width', 'height', 'min', 'mag', 'wrap']},
    {name: 'outviewport', usage: 'static', depends: ['width', 'height']},
    {name: 'outresolution', usage: 'static', depends: ['width', 'height']},
    {name: 'components', usage: 'static', pass: true},
    {name: 'type', usage: 'static', pass: true},
    {name: 'min', usage: 'static', pass: true},
    {name: 'mag', usage: 'static', pass: true},
    {name: 'wrap', usage: 'static', pass: true}
    ],
  compile: {},
  execute: {}
};


framebuffer.execute.outviewport = function({context}){
  let width = context.evaluate('width');
  let height = context.evaluate('height');
  
  return {x: 0, y: 0, width, height};
};

framebuffer.execute.outresolution = function({context}){
  let width = context.evaluate('width');
  let height = context.evaluate('height');
  
  return {width, height};
};


framebuffer.execute.out = function({context}){
  let {framebuffer} = context.compiled();
  return framebuffer;
};


framebuffer.compile.out = function({context}){
  let texture = context.evaluate('texture');
  let width = context.evaluate('width');
  let height = context.evaluate('height');
  let wrap = context.evaluate('wrap');
  let mag = context.evaluate('mag');
  let min = context.evaluate('min');
  let type = context.evaluate('type');
  let components = context.evaluate('components');


  let result = {};

  if (texture !== null) {
    // TODO: check that texture matches the options

    result.framebuffer = context.regl.framebuffer({
      color: texture,
      colorFormat: components,
      colorType: type,
      width,
      height,
      depth: false,
      stencil: false,
      wrap,
      mag,
      min
    });
  } else {
    result.framebuffer = context.regl.framebuffer({
      colorFormat: components,
      colorType: type,
      width,
      height,
      depth: false,
      stencil: false,
      wrap,
      mag,
      min
    });
  }

  return result;
};


module.exports = function(){
  return clone(framebuffer);
}
