/* The colour a CAD part was actually drawn in.

   The exporter that produced these FBX files writes each material's colour
   into its name - "P_C4E5_MainCasing_REV05:color:26:26:26" - and leaves the
   diffuse colour on the material itself unreliable: the casing above parses
   as pink, its lid as near-white, and parts share a material whose name
   belongs to a different component. Read from the name, the same pack comes
   out in the colours the drawing specifies.

   Values are 0-255 sRGB, so they are converted to linear for a renderer
   writing sRGB out. Materials without the suffix keep whatever colour they
   arrived with. */
(function (global) {
  'use strict';

  var NAMED = /:color:(\d{1,3}):(\d{1,3}):(\d{1,3})/i;

  function fromMaterial(material, THREE) {
    var base = material && material.color
      ? material.color.clone()
      : new THREE.Color(0xb6bcc6);
    if (!material || !material.name) return base;
    var hit = NAMED.exec(material.name);
    if (!hit) return base;
    var r = Math.min(255, parseInt(hit[1], 10));
    var g = Math.min(255, parseInt(hit[2], 10));
    var b = Math.min(255, parseInt(hit[3], 10));
    /* 0:0:0 is the CAD's way of saying no appearance was assigned to the
       part, not that it is painted black - the heavy machinery enclosure
       carries it and is bare sheet metal. Those keep the colour the file
       gives them. */
    if (r === 0 && g === 0 && b === 0) return base;
    var colour = new THREE.Color(r / 255, g / 255, b / 255);
    return colour.convertSRGBToLinear ? colour.convertSRGBToLinear() : colour;
  }

  global.WSTCadColour = { fromMaterial: fromMaterial };
})(window);
