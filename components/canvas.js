



const clone = require('clone');
const quad = require('glsl-quad');

let canvas = {
  inports: [{name: 'inviewport'}, {name: 'inresolution'}, {name: 'in'},
            
            {name: 'format', usage: 'static', initial: 'rgba'}],
  outports: [ {name: 'out', depends: ['inviewport', 'inresolution', 'in', 'format']}],
  compile: {},
  execute: {}
};



canvas.compile.out = function({context}) {
  let format = context.evaluate('format');

  const vert = `
    precision highp float;
    attribute vec2 a_position;
    attribute vec2 a_uv;
    varying vec2 v_out_uv;

    void main(){
      v_out_uv = a_uv;

      gl_Position = vec4(a_position, 0, 1);
    }
  `;
  const frag = `
    precision highp float;
    uniform sampler2D u_texture;
    uniform vec2 u_in_lower;
    uniform vec2 u_in_upper;
    varying vec2 v_out_uv;

    void main(){
      vec2 in_uv = u_in_lower + v_out_uv*(u_in_upper - u_in_lower);
      
      gl_FragColor = vec4(0,0,0,1);

      gl_FragColor.${format} = texture2D(u_texture, in_uv).${format};
    }
  `;
  let command = context.regl({
    vert,
    frag,
    attributes: {
      a_position: quad.verts,
      a_uv: quad.uvs
    },
    elements: quad.indices,
    uniforms: {
      u_texture: context.regl.prop('u_texture'),
      u_in_lower: context.regl.prop('u_in_lower'),
      u_in_upper: context.regl.prop('u_in_upper')
    },
    viewport: context.regl.prop('viewport')
    // scissor: context.regl.prop('scissor')
  });

  return command;
};


canvas.execute.out = function({context}) {
  let command = context.compiled();

  let u_texture = context.require('in');
  let inviewport = context.evaluate('inviewport');
  let inresolution = context.evaluate('inresolution');

  let viewport = {x: 0, y: 0, width: 256, height: 256};
  // let scissor = {
  //   enable: true,
  //   box: viewport
  // };

  let u_in_lower = [inviewport.x/inresolution.width, inviewport.y/inresolution.height];
  let u_in_upper = [(inviewport.x+inviewport.width)/inresolution.width, (inviewport.y+inviewport.height)/inresolution.height];

  command({viewport, u_texture, u_in_lower, u_in_upper});

  return u_texture;
};



module.exports = function(){
  return clone(canvas);
};
