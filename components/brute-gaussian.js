
const clone = require('clone');
const quad = require('glsl-quad');
const nunjucks = require('nunjucks');

let gaussian = {
  name: 'Brute Gaussian',
  description: 'Brute Gaussian Filter',
  icon: 'gears',
  inports: [{name: 'sigma'}, {name: 'radius'},
            {name: 'inviewport'}, {name: 'inresolution'}, {name: 'in'},

            {name: 'format', usage: 'static', initial: 'rgba'},
            {name: 'outviewport'}, {name: 'outresolution'}, {name: 'framebuffer'} ],
  outports: [ {name: 'out', depends: ['sigma', 'radius', 'inviewport', 'inresolution', 'in', 'format', 'outviewport', 'outresolution', 'framebuffer']},
              {name: 'outviewport', pass: true},
              {name: 'outresolution', pass: true},
              {name: 'format', usage: 'static', pass: true}],
  compile: {},
  execute: {}
};


gaussian.compile.out = function ({context}) {
  let sigma = context.evaluate('sigma');
  let radius = context.statically('radius');
  let inresolution = context.evaluate('inresolution');
  let inviewport = context.evaluate('inviewport');
  let outresolution = context.evaluate('outresolution');
  let outviewport = context.evaluate('outviewport');
  let format = context.statically('format');
  let framebuffer = context.evaluate('framebuffer', context.regl.prop('framebuffer'));
  // let glslType = format.length == 1 ? 'float' : `vec${format.length}`;


  let constants = {decl: {}, expr: {}, js: {}};
  constants.decl.PI = 'const float PI = 3.141592653589793;';
  constants.expr.PI = 3.141592653589793;
  constants.js.PI = 3.141592653589793;

  let uniforms = {};

  constants.decl.in_view = {};
  constants.expr.in_view = {};
  constants.js.in_view = {};


  constants.decl.out_view = {};
  constants.expr.out_view = {};
  constants.js.out_view = {};



  if (inresolution === undefined) {
    constants.decl.in_dims = 'uniform highp ivec2 _in_dims;';
    constants.expr.in_dims = '_in_dims';
    constants.js.out_dims = undefined;
    uniforms._in_dims = (context, props) => [props.inresolution.width, props.inresolution.height];


    constants.decl.in_pixel_delta = 'uniform highp vec2 _in_pixel_delta;';
    constants.expr.in_pixel_delta = '_in_pixel_delta';
    constants.js.in_pixel_delta = undefined;
    uniforms._in_pixel_delta = (context, props) => { return [1 / props.inresolution.width, 1 / props.inresolution.height]; };
  } else {
    constants.decl.in_dims = `const highp ivec2 _in_dims = ivec2(${inresolution.width}, ${inresolution.height});`;
    constants.expr.in_dims = '_in_dims';
    constants.js.in_dims = {x: inresolution.width, y: inresolution.height};

    constants.decl.in_pixel_delta = `const highp vec2 _in_pixel_delta = vec2(${1 / inresolution.width}, ${1 / inresolution.height});`;
    constants.expr.in_pixel_delta = '_in_pixel_delta';
    constants.js.in_pixel_delta = {x: 1 / inresolution.width, y: 1 / inresolution.height};
  }

  if (outresolution === undefined) {
    constants.decl.out_dims = 'uniform highp ivec2 _in_dims;';
    constants.expr.out_dims = '_in_dims';
    constants.js.out_dims = undefined;
    uniforms._in_dims = (context, props) => [props.outresolution.width, props.outresolution.height];
  } else {
    constants.decl.out_dims = `const highp ivec2 _in_dims = ivec2(${outresolution.width}, ${outresolution.height});`;
    constants.expr.out_dims = '_in_dims';
    constants.js.out_dims = {x: outresolution.width, y: outresolution.height};
  }


  if (inviewport === undefined) {
    constants.decl.in_view.xy = 'uniform highp ivec2 _in_view_xy;';
    constants.expr.in_view.xy = '_in_view_xy';
    constants.js.in_view.xy = undefined;
    uniforms._in_view_xy = (context, props) => [props.inviewport.x, props.inviewport.y];

    constants.decl.in_view.dims = 'uniform highp ivec2 _in_view_dims;';
    constants.expr.in_view.dims = '_in_view_dims';
    constants.js.in_view.dims = undefined;
    uniforms._in_view_dims = (context, props) => [props.inviewport.width, props.inviewport.height];
  } else {
    constants.decl.in_view.xy = `highp ivec2 _in_view_xy = ivec2(${inviewport.x}, ${inviewport.y});`;
    constants.expr.in_view.xy = '_in_view_xy';
    constants.js.in_view.xy = {x: inviewport.x, y: inviewport.y};

    constants.decl.in_view.dims = `const highp ivec2 _in_view_dims = ivec2(${inviewport.width}, ${inviewport.height});`;
    constants.expr.in_view.dims = '_in_view_dims';
    constants.js.in_view.dims = {x: inviewport.width, y: inviewport.height};
  }

  if (outviewport === undefined) {
    constants.decl.out_view.xy = 'uniform highp ivec2 _out_view_xy;';
    constants.expr.out_view.xy = '_out_view_xy';
    constants.js.out_view.xy = undefined;
    uniforms._out_view_xy = (context, props) => [props.outviewport.x, props.outviewport.y];

    constants.decl.out_view.dims = 'uniform highp ivec2 _out_view_dims;';
    constants.expr.out_view.dims = '_out_view_dims';
    constants.js.out_view.dims = undefined;
    uniforms._out_view_dims = (context, props) => [props.outviewport.width, props.outviewport.height];
  } else {
    constants.decl.out_view.xy = `highp ivec2 _out_view_xy = ivec2(${outviewport.x}, ${outviewport.y});`;
    constants.expr.out_view.xy = '_out_view_xy';
    constants.js.out_view.xy = {x: outviewport.x, y: outviewport.y};

    constants.decl.out_view.dims = `const highp ivec2 _out_view_dims = ivec2(${outviewport.width}, ${outviewport.height});`;
    constants.expr.out_view.dims = '_out_view_dims';
    constants.js.out_view.dims = undefined;
  }

  /*
  constants.decl.out_view = {};
  constants.expr.out_view = {};
  constants.js.out_view = {};

  if (outresolution === undefined) {
    constants.decl.out_view.iresolution = 'uniform highp ivec2 _out_view_iresolution;';
    constants.expr.out_view.iresolution = '_out_view_iresolution';
    constants.js.out_view.iresolution = undefined;
    uniforms._out_view_iresolution = context.regl.prop('outresolution');
  } else {
    constants.decl.out_view.iresolution = `const highp ivec2 _out_view_iresolution = ivec2(${outresolution.x}, ${outresolution.y});`;
    constants.expr.out_view.iresolution = '_out_view_iresolution';
    constants.js.out_view.iresolution = {x: outresolution.x, y: outresolution.y};
  }

  if (outresolution === undefined) {
    constants.decl.out_view.pixel_delta = 'highp vec2 _out_view_pixel_delta = 1.0/vec2(_out_view_iresolution);';
    constants.expr.out_view.pixel_delta = '_out_view_pixel_delta';
    constants.js.out_view.pixel_delta = undefined;
  } else {
    let outPixelDelta = {x: 1/outresolution.x, y: 1/outresolution.y};
    constants.decl.out_view.pixel_delta = `const vec2 _out_view_pixel_delta = vec2(${outPixelDelta.x}, ${outPixelDelta.y});`;
    constants.expr.out_view.pixel_delta = `vec2(${outPixelDelta.x}, ${outPixelDelta.y})`;
    constants.js.out_view.pixel_delta = outPixelDelta;
  }

  if (outLower === undefined) {
    constants.decl.out_view.ilower = 'uniform highp vec2 _out_view_ilower;';
    constants.expr.out_view.ilower = '_out_view_ilower';
    constants.js.out_view.ilower = undefined;
    uniforms._out_view_ilower = context.regl.prop('outLower');
  } else {
    constants.decl.out_view.ilower = `const highp vec2 _out_view_ilower = vec2(${outLower.x}, ${outLower.y});`;
    constants.expr.out_view.ilower = `vec2(${outLower.x}, ${outLower.y})`;
    constants.js.out_view.ilower = outLower;
  }

  constants.expr.out_xform = '1.0';
  constants.expr.in_xform = '1.0';

  constants.decl.out_view.uv = `highp vec2 _out_view_uv = ${constants.expr.out_xform}*a_uv;`;
  constants.expr.out_view.uv = '_out_view_uv';
  constants.decl.in_view.uv = `highp vec2 _in_view_uv = ${constants.expr.in_xform} * (${constants.expr.in_view.uv_lower} + _out_view_uv*(${constants.expr.in_view.uv_upper} - ${constants.expr.in_view.uv_lower}));`
  constants.expr.in_view.uv = '_in_view_uv';

  // constants.decl.in_view.ixy = `highp vec2 _in_view_ixy = ivec2(_in_view_uv*)`;
  */

  constants.decl.in_channel = 'uniform sampler2D in_channel;';
  constants.expr.in_channel = 'in_channel';
  constants.js.in_channel = undefined;
  uniforms.in_channel = context.regl.prop('in_channel');

  let kernelSide = radius * 2 + 1;
  let samples = kernelSide * kernelSide;
  let uvCount = Math.ceil(samples / 2) | 0;

  let sigmaSqr;
  if (sigma === undefined) {
    constants.decl.sigma = 'uniform float sigma;';
    constants.decl.sigma_square = 'float sigma_square = sigma*sigma;';
    constants.expr.sigma = 'sigma';
    constants.expr.sigma_square = 'sigma_square';
    constants.js.sigma = undefined;
    constants.js.sigma_square = undefined;
    uniforms.sigma = context.regl.prop('sigma');
  } else {
    sigmaSqr = sigma * sigma;
    constants.decl.sigma = `const float sigma = float(${sigma});`;
    constants.decl.sigma_square = `const float sigma_square = float(${sigmaSqr});`;
    constants.expr.sigma = 'sigma';
    constants.expr.sigma_square = 'sigma_square';
    constants.js.sigma = sigma;
    constants.js.sigma_square = sigmaSqr;
  }

  constants.decl.w = [];
  constants.expr.w = [];
  constants.js.w = [];

  for (let i = 0; i < samples; ++i) {
    let rx = ((i % kernelSide) | 0) - radius;
    let ry = ((i / kernelSide) | 0) - radius;

    // console.log('rx:',rx);
    // console.log('ry:',ry);

    if (sigmaSqr !== undefined) {
      // weight for sample i
      let wi = (1 / (2 * constants.js.PI * sigmaSqr)) * Math.exp(-(rx * rx + ry * ry) / (2 * sigmaSqr));
      constants.decl.w.push('');
      constants.expr.w.push(wi);
      constants.js.w.push(wi);
    } else {
      constants.decl.w.push(`highp float w${i} = (1.0 / (2.0*${constants.js.PI}*${constants.expr.sigma_square})) * exp(-(float(${rx * rx}) + float(${ry * ry})) / (2.0*${constants.expr.sigma_square}));`);
      constants.expr.w.push(`w${i}`);
      constants.js.w.push(undefined);
    }
  }

  constants.js.precision = 'highp';

  function makeVert () {
    return nunjucks.renderString(`
      precision {{constants.js.precision}} float;

      struct out_view_port_t{
        highp ivec2 xy;
        highp ivec2 wh;
      };

      struct in_view_port_t{
        highp ivec2 xy;
        highp ivec2 wh;
        highp vec2 uv_pixel_delta;
      };

      varying vec4 v_nuvs[{{uvCount}}];
      void process(ivec2 in_dims,
                   in_view_port_t in_view_port,
                   out_view_port_t out_view_port,
                   highp vec2 uv)
      {
        highp vec2 in_uv = vec2(in_view_port.xy) + (uv * vec2(in_view_port.wh)) / vec2(in_dims);

        // precompute the sample in-uvs around the center of this pixel neighborhood.
        {% for i in range(samples) %}
          // pack the sample uvs into xy, zw alternatively.
          {% set uvcomp = 'xy' if (i % 2) == 0 else 'zw' %}

          // the relative x,y around the center pixel
          {% set rx = (i % kernelSide) - kernelSide//2 %}
          {% set ry = (i // kernelSide) - kernelSide//2 %}

          v_nuvs[{{i//2}}].{{uvcomp}} = in_uv + vec2({{rx}}, {{ry}}) * in_view_port.uv_pixel_delta;
        {% endfor %}
      }

      attribute vec2 a_uv;
      attribute vec2 a_position;

      {{constants.decl.in_dims}}
      {{constants.decl.in_pixel_delta}}

      {{constants.decl.in_view.xy}}
      {{constants.decl.in_view.dims}}

      {{constants.decl.out_view.xy}}
      {{constants.decl.out_view.dims}}

      void main(){

        out_view_port_t out_view_port;
        out_view_port.xy = _out_view_xy;
        out_view_port.wh = _out_view_dims;

        in_view_port_t in_view_port;
        in_view_port.xy = _in_view_xy;
        in_view_port.wh = _in_view_dims;
        in_view_port.uv_pixel_delta = {{constants.expr.in_pixel_delta}};

        highp vec2 uv = a_uv;
        process({{constants.expr.in_dims}}, in_view_port, out_view_port, uv);

        gl_Position = vec4(a_position.xy, 0, 1);
      }
    `, {constants, kernelSide, samples, uvCount});
  }

  function makeFrag () {
    return nunjucks.renderString(`
      precision {{constants.js.precision}} float;

      varying vec4 v_nuvs[{{uvCount}}];

      {{constants.decl.sigma}}
      {{constants.decl.sigma_square}}
      {{constants.decl.in_channel}}

      void main() {
        gl_FragColor = vec4(0);

        highp float wsum = 0.0;
        {% for i in range(samples) %}
          {% set uvcomp = 'xy' if i % 2 == 0 else 'zw' %}
          {{constants.decl.w[i]}}
          wsum += float({{constants.expr.w[i]}});
          gl_FragColor.{{format}} += texture2D({{constants.expr.in_channel}}, v_nuvs[{{i//2}}].{{uvcomp}}).{{format}} * float({{constants.expr.w[i]}});
        {% endfor %}

        gl_FragColor.{{format}} /= wsum;

        gl_FragColor.a = 1.0;
      }
    `, {constants, uvCount, samples, format});
  }

  let viewport = {};

  if (outviewport === undefined) {
    viewport.x = (context, props) => props.outviewport.x;
    viewport.y = (context, props) => props.outviewport.y;

    viewport.width = (context, props) => props.outviewport.width;
    viewport.height = (context, props) => props.outviewport.height;
  } else {
    viewport.x = outviewport.x;
    viewport.y = outviewport.y;

    viewport.width = outviewport.width;
    viewport.height = outviewport.height;
  }

  let vert = makeVert();
  let frag = makeFrag();

  // console.log('frag:',frag);
  return context.regl({
    vert,
    frag,
    attributes: {
      a_position: quad.verts,
      a_uv: quad.uvs
    },
    elements: quad.indices,
    uniforms: uniforms,
    framebuffer,
    viewport
  });
};

gaussian.execute.out = function ({context}) {
  let cmd = context.compiled();
  let params = {};
  params.in_channel = context.require('in');
  params.framebuffer = context.require('framebuffer');

  params.inresolution = context.require('inresolution');
  params.inviewport = context.require('inviewport');
  params.outviewport = context.require('outviewport');
  params.outresolution = context.require('outresolution');
  params.format = context.statically('format');

  params.sigma = context.require('sigma');
  params.radius = context.statically('radius');

  cmd(params);

  return context.require('framebuffer');
};

module.exports = function () {
  return clone(gaussian);
};
