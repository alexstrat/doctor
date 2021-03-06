var rules = [];

rules.push({
  type: 'script',
  transform: function (node) {
    node.item('path', node.path);
    node.item('functions', {});
  }
});

/* merge and normalize comments */
rules.push({
  match: function (node) {
    return typeof node.comments !== 'undefined' && node.comments.length > 0;
  },
  transform: function (node) {
    var comments = node.comments;
    var lastComment = comments[comments.length - 1];
    var commentText = "";

    comments.forEach(function (comment, i) {
      var text;
      if (comment.indexOf('/*') === 0) {
        text = '  ' + comment.substr(2, comment.length - 4);
        text = text.replace(/^[\s\*]*(\r\n|\n|\r)/, '');
        text = text.replace(/(\r\n|\n|\r)[\s\*]*$/, '');
        text = text.replace(/\s+$/, '');
        // var lines = text.split(/(\r\n|\n|\r)/);
        var lines = text.split(/\r\n|\n|\r/);
        lines.forEach(function (line, i) {
          var padMatch = line.match(/^\s*\*/);
          if (padMatch) {
            lines[i] = padMatch[0].replace(/\*/g, ' ') + line.replace(/^\s*\*/, '');
          }
        });
        text = lines.join('\n');
      } else {
        text = '  ' + comment.substr(2);
      }
      if (commentText !== '') {
        text = '\n' + text;
      }
      commentText += text;
    });

    var lines = commentText.split(/\n/);

    var indent = -1;
    var i;
    for (i = 0; i < lines.length; i++) {
      if (lines[i].match(/^\s*$/)) {
        continue;
      }
      var padMatch = lines[i].match(/^\s*/);
      if (padMatch[0].length === 0) {
        indent = 0;
        break;
      }
      if (indent < 0 || padMatch[0].length < indent) {
        indent = padMatch[0].length;
      }
    }
    if (indent > 0) {
      lines.forEach(function (line, i) {
        lines[i] = line.replace(new RegExp('^\\s{0,' + indent + '}'), '');
      });
    }

    node.commentText = lines.join('\n');
  }
});

var commentTagFunctions = {
  "description": function (value, node) {
    node.description = value.description;
  },
  "types": function (value, node) {
    node.types = value;
  },
  "param": function (value, node) {
    if (!node.paramTags) {
      node.paramTags = {};
    }
    var paramTag = {};
    if (!node.paramTags[value.name]) {
      node.paramTags[value.name] = paramTag;
    } else {
      paramTag = node.paramTags[value.name];
    }
    paramTag.name = value.name;
    if (value.property) {
      if (!paramTag.properties) {
        paramTag.properties = [];
      }
      value.name = value.property;
      delete value.property;
      paramTag.properties.push(value);
    } else {
      Object.keys(value).forEach(function (key) {
        paramTag[key] = value[key];
      });
    }
  },
  "returns": function (value, node) {
    node.returnTag = value;
    node.returns = value;
  },
  "classDescription": function (value, node) {
    node.classDescription = value;
  },
  "constructor": function (value, node) {
    node.constructorDescription = value;
  },
  "property": function (value, node) {
    node.properties = node.properties || [];
    node.properties.push(value);
  },
  "example": function (value, node) {
    node.examples = node.examples || [];
    node.examples.push(value);
  },
  "visibility": function (value, node) {
    node.visibility = value;
  },
  "extends": function (value, node) {
    node.extends = value;
  },
  "abstract": function (value, node) {
    node.abstract = true;
  },
  "signature": function (value, node) {
    if (!node.description || node.description === '') {
      node.description = value.description;
    }
    node.checksSignature = true;
  },
  "copy": function (value, node) {
    node.copyTags = value;
  }
};

function commentTransform(node, transform) {
  try {
    return transform.options.commentParser.parse(node.commentText);
  } catch (e) {
    var file = node.item('path');
    var comment = node.commentText;
    var msg = 'Error parsing comment tag in file ' + file + ':' + node.line + ' - ' + e +
        ', comment text: ' + comment;


    if (process.env.DEBUG) {
      console.error(msg);
      return [];
    } else {
      throw new Error(msg);
    }
  }
}

/* parse tags from comments */
rules.push({
  match: function (node) {
    return typeof node.commentText === 'string' && node.commentText !== '';
  },
  transform: function (node, transform) {
    var tags = commentTransform(node, transform);
    node.commentTags = tags;
    node.commentTags.forEach(function (tag, i) {
      if (tag.name in commentTagFunctions) {
        commentTagFunctions[tag.name](tag.value, node);
      }
    });
  }
});

function transformFunction(node) {
  var nameNode = node.nodes[0];
  var paramsNodes = node.nodes[1] ? node.nodes[1].nodes : [];
  node.name = nameNode.value;
  if (node.name) {
    node.item('functions')[node.name] = node;
  }
  node.params = [];
  node.paramIndex = {};

  var paramTags = node.paramTags;
  // for functions assigned to variables, paramTags are in parent --
  // i.e. '/* @param a */ var parent = function (a) {}'
  if (node.paramTags === undefined && node.parent &&
      node.parent.type === 'assign' && node.parent.paramTags) {
    paramTags = node.parent.paramTags;
  }
  node.item('paramTags', paramTags);

  if (node.copyTags) {
    var tagSource = node.item('functions')[node.copyTags];
    if (tagSource) {
      if (!node.description && tagSource.description) {
        node.description = tagSource.description;
      }
      if (!paramTags && tagSource.item('paramTags')) {
        paramTags = tagSource.item('paramTags');
      }
    }
  }

  paramsNodes.forEach(function (paramNode, i) {
    var param = {
      name: paramNode.value
    };
    node.paramIndex[param.name] = i;
    if (paramTags) {
      if (paramTags[param.name]) {
        var tagValue = paramTags[param.name];
    // if (node.item('path') === 'cli') {
    //   console.log(tagValue)
    // }
        Object.keys(tagValue).forEach(function (key, i) {
          if (key !== 'name') {
            param[key] = tagValue[key];
          }
        });
      }
    }
    node.params.push(param);
  });
    // if (node.item('path') === 'cli') {
    //   console.log(node.params)
    // }
}

rules.push({
  type: 'define-function',
  transform: transformFunction
});

rules.push({
  type: 'function',
  transform: transformFunction
});

module.exports = rules;
