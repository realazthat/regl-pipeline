
const regl = require('regl')({
  extensions: ['OES_texture_float']
});
const resl = require('resl');

const $ = require('jquery-browserify');
const pipeline = require('./regl-pipeline.js');

resl({
  manifest: {
    texture: {
      type: 'image',
      src: './assets/Storm Cell Over the Southern Appalachian Mountains-dsc_2303_0-256x256.png',
      parser: (data) => regl.texture({
        data: data,
        mag: 'nearest',
        min: 'nearest',
        flipY: true
      })
    }
  },
  onDone: ({texture}) => {
    // make a bunch of fbos for ping-ponging intermediate computations, and the output buffer etc.
    let fbos = [null, null, null, null].map(function () {
      return regl.framebuffer({
        color: regl.texture({
          width: texture.width,
          height: texture.height,
          stencil: false,
          format: 'rgba',
          type: 'float',
          depth: false,
          wrap: 'clamp',
          mag: 'nearest',
          min: 'nearest'
        }),
        stencil: false,
        depth: false,
        depthStencil: false,
        wrap: 'clamp',
        mag: 'nearest',
        min: 'nearest'
      });
    });


    $('canvas').css('z-index', '-5');
    $('body').append($('<input>').attr('type', 'range').attr('min', '0.1').attr('value', '0.1').attr('max', '255').attr('step','0.1').attr('id', 'sigma'));
    $('body').append($('<input>').attr('type', 'range').attr('min', '0').attr('value', '1').attr('max', '255').attr('step','1').attr('id', 'radius'));

    let dag = pipeline.DAG({regl});
    let blur = pipeline.components.blur.gaussian({dag});
    dag.constant(blur, 'in', texture, 'dynamic');
    dag.constant(blur, 'framebuffer', null, 'dynamic');
    dag.constant(blur, 'radius', 3, 'static');
    dag.constant(blur, 'sigma', 0.84089642, 'dynamic');
    dag.constant(blur, 'inResolution', {width: texture.width, height: texture.height}, 'static');
    dag.constant(blur, 'inViewPort', {x: 0, y: 0, width: texture.width, height: texture.height}, 'static');
    dag.constant(blur, 'outResolution', {width: texture.width, height: texture.height}, 'static');
    dag.constant(blur, 'outViewPort', {x: 0, y: 0, width: texture.width, height: texture.height}, 'static');

    let frame = 0;
    regl.frame(function(){

      regl.clear({
        color: [0, 0, 0, 1],
        depth: 1,
        stencil: 0
      });

      let sigma = parseFloat($('#sigma').val());
      dag.constant(blur, 'sigma', sigma, 'dynamic');
      let radius = parseInt($('#radius').val());
      dag.constant(blur, 'radius', radius, 'static');
      console.log('radius:', radius);

      dag.execute({node: blur, regl, frame});

      frame++;

      // draw({texture: blur.outvalues.out});
      // console.log('hi');
    });

  }
});


