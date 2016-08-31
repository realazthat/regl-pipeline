
const nunjucks = require('nunjucks');
const assert = require('assert');
const clone = require('clone');
const pipeline = require('../regl-pipeline.js');
const GitHub = require('github-api');
const noflo = require('noflo');

const $ = require('jquery');
window.$ = $;
window.jQuery = $;

// require('webcomponents.js');

// TODO: react addons
// const React = require('react');
// window.React = React;


// const ReactDOM = require('react-dom');
// window.ReactDOM = ReactDOM;

// React.unmountComponentAtNode = ReactDOM.unmountComponentAtNode;

$(window).on('WebComponentsReady', function () {
  console.log('Components are ready');
});

nunjucks.configure('views', {
  autoescape: true
});

window.noflo = noflo;

$(document).ready(function () {
  const regl = require('regl')();
  const resl = require('resl');

  const Polymer = window.Polymer;

  Polymer.veiledElements = ['the-graph-editor'];
  window.addEventListener('polymer-ready', function () {
    'use strict';

    $('body > canvas')
      .css('z-index:', '1000')
      .css('pointer-events', 'none')
      ;

    // The graph editor
    var editor = document.getElementById('editor');
    // Component library
    var library = {
      none: {
        name: 'basic',
        description: 'basic demo component',
        icon: 'eye',
        inports: [
          {'name': '>in', 'type': 'all'}
        ],
        outports: [
          {'name': 'out>', 'type': 'all'}
        ]
      }
    };

    for (let component of Object.keys(pipeline.components)) {
      let componentInfo = pipeline.components[component];
      library[component] = {
        name: componentInfo.name,
        description: componentInfo.description,
        icon: componentInfo.icon,
        inports: clone(componentInfo.inports),
        outports: clone(componentInfo.outports)
      };
    }

    // library.slider = {
    //   name: 'Slider',
    //   description: 'Choose a number',
    //   icon: 'sliders',
    //   inports: [{name: 'name'}, {name: 'min'}, {name: 'max'}, {name: 'step'}],
    //   outports: [{name: 'out'}]
    // };

    // add all the components to the menu
    Object.keys(library).forEach(function (component) {
      $('#addnode-menu').append($('<li>').append($('<a>').attr('href', '#').text(component)));
    });

    $('#addnode-menu').find('a').on('click', function () {
      let component = $(this).text();
      // console.log('component:', component);
      addnode(component);
    });

    window.gh = new GitHub();
    editor.$.graph.library = library;
    // Load empty graph
    window.graph = {};
    editor.graph = window.graph;

    window.dag = pipeline.DAG({regl, resl, getNofloGraph: () => editor.nofloGraph, pipeline});

    var nav = document.getElementById('nav');
    nav.editor = editor;

    // Add node button
    var addnode = function (component) {
      var id = Math.round(Math.random() * 100000).toString(36);
      var metadata = {
        label: component,
        x: 0,
        y: 0
      };
      var newNode = editor.nofloGraph.addNode(id, component, metadata);

      window.dag.initializeNode({node: newNode.id});
      return newNode;
    };
    $('#focus').on('click', function () {
      let selected = editor.selectedNodes;
      if (selected.length === 0) {
        return;
      }

      editor.focusNode(selected[0]);
    });

    function clearSelected () {
      $('#selected-id').val('').trigger('change');
    }
    function setSelected (floNode) {
      $('#selected-id').val(floNode.id).trigger('change');
    }

    // stop all events from propogating from the #testing div up to the graph
    $('#testing').on('keydown keypress keyup', function (e) {
      e.stopPropagation();
    });

    $('#selected-id').on('change', function () {
      let node = $('#selected-id').val();

      $('#selected-node-props').empty();
      if (node === undefined || node === null || node.length === 0) {
        $('#execute-node').prop('disabled', true);
        $('#compile-node').prop('disabled', true);
        return;
      }

      $('#execute-node').prop('disabled', false);
      $('#compile-node').prop('disabled', false);

      let nofloNode = editor.nofloGraph.getNode(node);

      let $tr = $('<tr>').appendTo($('#selected-node-props'));
      $('<th>').appendTo($tr).text('node');
      $('<td>').appendTo($tr).text(node);

      let componentInfo = editor.getLibrary()[nofloNode.component];

      for (let inportInfo of componentInfo.inports) {
        let inport = inportInfo.name;

        let {value, usage} = window.dag.getAttached({node, inport});

        // console.log(`inport ${inport}, attached value: ${value}, usage: ${usage}`);

        if (value !== undefined) {
          value = JSON.stringify(value);
        }

        let template = `
        <tr>
          <th>{{inport}}</th>
          <td>
            <div class="input-group">
              <select class="regl-pipeline-port-attached-usage form-control input-group-addon">
                <option value="usage">usage</option>
                <option {% if usage == 'static' %}selected="selected"{% endif %} value="static" title="Changing the value will require recompilation of parts of the pipeline">static</option>
                <option {% if usage == 'dynamic' %}selected="selected"{% endif %} value="dynamic" title="Easily change this value later">dynamic</option>
              </select>
              <span class="input-group-addon"></span> 
              <input type="text" class="regl-pipeline-port-attached form-control input-group-addon" aria-label="..." placeholder="value (use JSON)" value="{{value}}">
            </div><!-- /input-group -->

          </td>
        </tr>
        `;

        let $tr = $(nunjucks.renderString(template, {inport, value, usage})).appendTo($('#selected-node-props'));

        let $usage = $tr.find('.regl-pipeline-port-attached-usage');

        let $attached = $tr.find('input.regl-pipeline-port-attached');

        let updateAttached = function updateAttached (node, inport, $attached, $usage) {
          let value = $attached.val();

          // console.log('inport:', inport, ', $attached.val(): ', $attached.val());
          value = value.trim();

          let usage = $usage.val();

          if (value.length === 0) {
            window.dag.removeAttached({node, inport});
            return;
          } else if (value === 'undefined') {
            value = undefined;
          } else if (value === 'null') {
            value = null;
          } else if (value === 'true') {
            value = true;
          } else if (value === 'false') {
            value = false;
          } else {
            try {
              value = JSON.parse(value);
            } catch (e) {
              $($attached).addClass('alert alert-danger');
              return;
            }
          }
          $($attached).removeClass('alert alert-danger');

          if (usage !== 'static' && usage !== 'dynamic') {
            $($attached).addClass('alert alert-danger');
            return;
          }
          $($attached).removeClass('alert alert-danger');

          try {
            window.dag.setAttached({node, inport, value, usage});
          } catch (e) {
            $($attached).addClass('alert alert-danger');
          }
        };

        $usage.on('change', function () {
          updateAttached(node, inport, $attached, $usage);
        });

        $attached.on('change', function () {
          updateAttached(node, inport, $attached, $usage);
        });

        // console.log('$attached.val():', $attached.val());
        updateAttached(node, inport, $attached, $usage);
      }
    });

    // set some defaults when the selected node is empty.
    $('#selected-id').trigger('change');

    $(editor).on('nodes', function () {
      let selected = editor.selectedNodes;

      if (selected.length === 0) {
        clearSelected();
        return;
      }

      if (selected.length === 1) {
        setSelected(selected[0]);
        return;
      }
    });

    // Autolayout button
    $('#autolayout').on('click', function () {
      editor.triggerAutolayout();
    });

    // function resetStoredGraphs () {
    //   window.localStorage.storedGraphs = JSON.stringify([]);
    // }

    function getStoredGraphs () {
      if (!window.localStorage.hasOwnProperty('storedGraphs')) {
        return [];
      }

      try {
        return JSON.parse(window.localStorage.storedGraphs);
      } catch (e) {
        return [];
      }
    }

    // save to storage button
    $('#save-graph-to-storage').on('click', function () {
      var graphJSON = serializeGraph();

      let storedGraphs = getStoredGraphs();

      storedGraphs.push({graphJSON, date: new Date()});

      window.localStorage.storedGraphs = JSON.stringify(storedGraphs);
    });

    function loadGraph ({graph}) {
      return Promise.resolve()
        .then(function () {
          window.graph = clone(graph);
          editor.graph = window.graph;

          // TODO: should we resolve only after clearing the cache?
          $(editor).one('graphInitialised', function () {
            for (let nofloNode of editor.nofloGraph.nodes) {
              let node = nofloNode.id;

              window.dag.clearCache({node});
            }
          });

          return Promise.resolve();
        });
    }

    function serializeGraph () {
      let graph = clone(editor.nofloGraph.toJSON());

      // console.log('serializeGraph, graph:', graph);

      // for (let nofloNode of graph.nodes) {
      //   let metadata = nofloNode.metadata;
      //   if (metadata === undefined)
      //     continue;

      //   if (metadata.cached === undefined)
      //     continue;

      //   delete metadata.cached;
      // }

      return JSON.stringify(graph);
    }

    // load from storage button
    $('#load-graph-from-storage').on('click', function () {
      let storedGraphs = getStoredGraphs();
      storedGraphs.reverse();

      $('#stored-graph-list').empty();

      storedGraphs.forEach(function (storedGraph, i) {
        let $graphButton = $('<a class="list-group-item">').text(storedGraph.date);

        $graphButton.attr('data-stored-graph-index', i);
        $('#stored-graph-list').append($graphButton);
      });

      assert($('#stored-graph-list > .list-group-item').length === storedGraphs.length);

      $('#stored-graph-list > .list-group-item').on('click', function () {
        $('#stored-graph-list > .list-group-item').removeClass('active');
        $(this).addClass('active');
        $('#stored-graph-modal-submit').removeClass('disabled');
      });

      $('#stored-graph-modal-submit').addClass('disabled');

      if (storedGraphs.length > 0) {
        $('#stored-graph-list > .list-group-item').eq(0).click();
      }

      $('#stored-graph-modal-alert').hide();
      $('#stored-graph-modal').modal('show');

      $('#stored-graph-modal-submit').on('click', function () {
        let $active = $('#stored-graph-list > .list-group-item.active');
        // console.log('active:', $active);

        if ($active.length === 0) {
          $('#stored-graph-modal-alert').text('Nothing selected').show();
          return;
        }

        let i = parseInt($active.attr('data-stored-graph-index'));
        let storedGraph = storedGraphs[i];
        let graphJSON = storedGraph.graphJSON;

        try {
          graphJSON = JSON.parse(graphJSON);
        } catch (e) {
          $('#stored-graph-modal-alert').text('Error parsing graph').show();
          return;
        }

        // console.log(graphJSON);

        loadGraph({graph: graphJSON})
          .then(function () {
            $('#stored-graph-modal').modal('hide');
            return Promise.resolve();
          })
          .catch(function (err) {
            console.error(err);
            $('#stored-graph-modal-alert').text('Error parsing graph').show();
          });
      });
    });

    // load from storage button
    $('#load-graph-from-gist').on('click', function () {
      $('#load-graph-from-gist-modal').modal('show');

      $('#load-graph-from-gist-form').on('submit', function () {
        let gistid = $('#load-graph-from-gist-gistid').val();
        let file = $('#load-graph-from-gist-file').val();
        let parts = ['#gist', gistid];

        if (file.length > 0) {
          parts.push(file);
        }

        let hash = parts.join('/');

        window.location.hash = hash;
        $('#load-graph-from-gist-modal').modal('hide');
      });
    });

    // load from storage button
    $('#save-graph-to-gist').on('click', function () {
      let graphJSON = serializeGraph();
      // console.log(graphJSON);

      let gist = window.gh.getGist();
      gist.create({
        public: true,
        description: 'regl-pipeline graph',
        files: {
          'graph.json': {
            content: graphJSON
          }
        }
      }).then(function ({data}) {
        let parts = ['#gist', data.id, 'graph.json'];

        window.location.hash = parts.join('/');

        return Promise.resolve();
      }).catch(function (err) {
        console.error(err);
      });
    });

    $('#compile-node').on('click', function () {
      let selected = editor.selectedNodes;

      for (let nofloNode of selected) {
        let node = nofloNode.id;
        editor.removeErrorNode(node);
        editor.updateErrorNodes();
        Promise.resolve()
          .then(function () {
            return Promise.resolve(window.dag.pullStatic({node}));
          })
          .then(function () {
            return Promise.resolve(window.dag.compile({node, force: true}));
          })
          .then(function () {
            return Promise.resolve(window.dag.executeSync({node, runtime: 'static', force: true}));
          })
          .catch(function (err) {
            console.error(err);
            editor.addErrorNode(node);
            editor.updateErrorNodes();
          });
      }
    });

    $('#execute-node').on('click', function () {
      let selected = editor.selectedNodes;

      for (let nofloNode of selected) {
        let node = nofloNode.id;

        editor.removeErrorNode(node);
        editor.updateErrorNodes();
        Promise.resolve()
          .then(function () {
            window.dag.pullDynamic({node});
            return Promise.resolve();
          })
          .then(function () {
            return Promise.resolve(window.dag.executeSync({node, runtime: 'dynamic'}));
          })
          .catch(function (err) {
            console.error(err);
            editor.addErrorNode(node);
            editor.updateErrorNodes();
          });
      }
    });

    $('#execute-all').on('click', function () {
      // clear all error nodes.
      for (let node of window.dag.ordering()) {
        editor.removeErrorNode(node);
      }
      editor.updateErrorNodes();

      function failure (err, node) {
        console.error(err);
        editor.addErrorNode(node);
      }

      Promise.resolve()
        .then(function () {
          return window.dag.compileFrame({force: false, failure, parallel: false});
        })
        .then(function (results) {
          window.dag.executeFrameSync({failure, parallel: false});
          return Promise.resolve();
        })
        .then(function () {

        })
        .catch(function (err) {
          editor.updateErrorNodes();
          console.error(err);
        });
    });

    $('#clear-node-cache').on('click', function () {
      let selected = editor.selectedNodes;

      for (let nofloNode of selected) {
        let node = nofloNode.id;

        window.dag.clearCache({node});
      }
    });

    $('#clear-graph-cache').on('click', function () {
      for (let nofloNode of editor.nofloGraph.nodes) {
        let node = nofloNode.id;

        window.dag.clearCache({node});
      }
    });

    // Get graph button
    $('#get').on('click', function () {
      var graphJSON = serializeGraph();
      $('#graph-source-textarea').val(graphJSON);
      $('#graph-source-modal').modal('show');
    });

    $('#save-graph-to-string').on('click', function () {
      var graphJSON = JSON.stringify(editor.nofloGraph);
      $('#graph-source-textarea').val(graphJSON);
      $('#graph-source-modal').modal('show');
    });

    function clearGraph () {
      return Promise.resolve()
        .then(function () {
          window.graph = {};
          editor.graph = window.graph;
          return Promise.resolve();
        });
    }

    // Clear button
    document.getElementById('clear').addEventListener('click', function () {
      clearGraph()
        .catch(function (err) {
          console.error(err);
        });
    });

    $(window).on('hashchange', function (e) {
      // console.log('hashchange');

      let hash = window.location.hash.slice(1);
      if (hash.startsWith('gist/')) {
        let [, gistid, path] = hash.split('/');

        $('#loading').show();

        let gist = window.gh.getGist(gistid);

        // clear graph
        // clearGraph()
        Promise.resolve()
          // .then(function(){
          //   return clearGraph();
          // })
          .then(function () {
            return gist.read();
          })
          .then(function (data) {
            // console.log(data);

            let files = data.data.files;

            if (path === undefined) {
              if (Object.keys(files).length > 0) {
                path = Object.keys(files)[0];
              }
            }

            if (!files.hasOwnProperty(path)) {
              throw new Error(`cannot find file at path "${path}" in gist "${gistid}"`);
            }

            if (files[path].truncated) {
              return $.ajax({url: files[path].raw_url})
                .then(function (graphJSON) {
                  let graph = JSON.parse(graphJSON);
                  return loadGraph({graph});
                });
            } else {
              let graphJSON = files[path].content;
              let graph = JSON.parse(graphJSON);
              return loadGraph({graph});
            }
          }).then(function () {
            $('#loading').hide();
            return Promise.resolve();
          }).catch(function (err) {
            $('#loading').hide();
            console.error(err);
            window.alert(`Unable to retrieve gist id=${gistid}, ${JSON.stringify(err)}`);
          });
      }
    });

    // trigger a hashchange event to initialize stuff to the initial hash

    $(editor).one('graphInitialised', function () {
      // console.log('graphInitialised');

      setTimeout(function () {
        $('#loading').hide();
        $(window).trigger('hashchange');
      }, 600);
    });

    // Resize to fill window and also have explicit w/h attributes
    var resize = function () {
      editor.setAttribute('width', window.innerWidth);
      editor.setAttribute('height', window.innerHeight);
    };
    window.addEventListener('resize', resize);

    resize();
  });
}); // $(document).ready(function(){ ...
