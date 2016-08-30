

const clone = require('clone');

const framebuffer = {
  inports: [
    {name: 'texture', usage: 'static'},
    {name: 'format', usage: 'static', initial: 'rgba'},
    {name: 'type', usage: 'static', initial: 'uint8'},
    {name: 'inresolution', usage: 'static'},
    {name: 'min', usage: 'static', initial: 'nearest'},
    {name: 'mag', usage: 'static', initial: 'nearest'},
    {name: 'wrap', usage: 'static', initial: 'clamp'}
    ],
  outports: [
    {name: 'out', depends: ['texture', 'type', 'format', 'inresolution', 'min', 'mag', 'wrap']},
    {name: 'outviewport', usage: 'static', depends: ['inresolution']},
    {name: 'outresolution', usage: 'static', depends: ['inresolution']},
    {name: 'format', usage: 'static', pass: true},
    {name: 'type', usage: 'static', pass: true},
    {name: 'min', usage: 'static', pass: true},
    {name: 'mag', usage: 'static', pass: true},
    {name: 'wrap', usage: 'static', pass: true}
    ],
  compile: {},
  execute: {}
};


framebuffer.execute.outviewport = function({context}){
  // TODO, the fbo in compiled.out() might have a mismatching width/height
  let inresolution = context.require('inresolution');
  
  return {x: 0, y: 0, width: inresolution.width, height: inresolution.height};
};

framebuffer.execute.outresolution = function({context}){
  // TODO, the fbo in compiled.out() might have a mismatching width/height
  let inresolution = context.require('inresolution');
  
  return {width: inresolution.width, height: inresolution.height};
};


framebuffer.execute.out = function({context}){
  let {framebuffer} = context.compiled();
  return framebuffer;
};


framebuffer.compile.out = function({context}){
  let texture = context.evaluate('texture');
  let inresolution = context.statically('inresolution');

  let params = {};

  for (let prop of ['wrap', 'min', 'mag']) {
    if (context.connected(prop)){
      params[prop] = context.evaluate(prop);
    }
  }

  let type = context.evaluate('type');
  let format = context.evaluate('format');

  let {width, height} = inresolution;

  params.width = width;
  params.height = height;
  params.colorFormat = format;
  params.colorType = type;
  params.depth = false;
  params.stencil = false;

  if (context.connected('texture')) {
    params.color = context.evaluate('texture');
  }

  let fbo = context.regl.framebuffer(params);

  return {framebuffer: fbo};
};


module.exports = function(){
  return clone(framebuffer);
}
