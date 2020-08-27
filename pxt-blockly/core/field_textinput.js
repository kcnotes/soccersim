/**
 * @license
 * Copyright 2012 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Text input field.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.provide('Blockly.FieldTextInput');

goog.require('Blockly.Colours');
goog.require('Blockly.Events');
goog.require('Blockly.Events.BlockChange');
goog.require('Blockly.Field');
goog.require('Blockly.fieldRegistry');
goog.require('Blockly.Msg');
goog.require('Blockly.pxtBlocklyUtils');
goog.require('Blockly.utils');
goog.require('Blockly.utils.aria');
goog.require('Blockly.utils.Coordinate');
goog.require('Blockly.utils.dom');
goog.require('Blockly.utils.KeyCodes');
goog.require('Blockly.utils.object');
goog.require('Blockly.utils.Size');
goog.require('Blockly.utils.userAgent');


/**
 * Class for an editable text field.
 * @param {string=} opt_value The initial value of the field. Should cast to a
 *    string. Defaults to an empty string if null or undefined.
 * @param {?Function=} opt_validator A function that is called to validate
 *    changes to the field's value. Takes in a string & returns a validated
 *    string, or null to abort the change.
 * @param {RegExp=} opt_restrictor An optional regular expression to restrict
 *    typed text to. Text that doesn't match the restrictor will never show
 *    in the text field.
 * @param {Object=} opt_config A map of options used to configure the field.
 *    See the [field creation documentation]{@link https://developers.google.com/blockly/guides/create-custom-blocks/fields/built-in-fields/text-input#creation}
 *    for a list of properties this parameter supports.
 * @extends {Blockly.Field}
 * @constructor
 */
Blockly.FieldTextInput = function(opt_value, opt_validator, opt_restrictor,
    opt_config) {
  /**
   * Allow browser to spellcheck this field.
   * @type {boolean}
   * @protected
   */
  this.spellcheck_ = true;

  if (opt_value == null) {
    opt_value = '';
  }
  Blockly.FieldTextInput.superClass_.constructor.call(this,
      opt_value, opt_validator, opt_config);

  /**
   * The HTML input element.
   * @type {HTMLElement}
   */
  this.htmlInput_ = null;

  /**
   * Key down event data.
   * @type {?Blockly.EventData}
   * @private
   */
  this.onKeyDownWrapper_ = null;

  /**
   * Key input event data.
   * @type {?Blockly.EventData}
   * @private
   */
  this.onKeyInputWrapper_ = null;

  /**
   * Whether the field should consider the whole parent block to be its click
   * target.
   * @type {?boolean}
   */
  this.fullBlockClickTarget_ = false;

  this.setRestrictor(opt_restrictor);
  this.addArgType('text');
};
Blockly.utils.object.inherits(Blockly.FieldTextInput, Blockly.Field);

/**
 * Construct a FieldTextInput from a JSON arg object,
 * dereferencing any string table references.
 * @param {!Object} options A JSON object with options (text, and spellcheck).
 * @return {!Blockly.FieldTextInput} The new field instance.
 * @package
 * @nocollapse
 */
Blockly.FieldTextInput.fromJson = function(options) {
  var text = Blockly.utils.replaceMessageReferences(options['text']);
  return new Blockly.FieldTextInput(text, undefined, options);
};

/**
 * Length of animations in seconds.
 */
Blockly.FieldTextInput.ANIMATION_TIME = 0.25;

/**
 * Padding to use for text measurement for the field during editing, in px.
 */
Blockly.FieldTextInput.TEXT_MEASURE_PADDING_MAGIC = 45;

/**
 * The HTML input element for the user to type, or null
 * @type {HTMLInputElement}
 * @private
 */
Blockly.FieldTextInput.prototype.htmlInput_ = null;

/**
 * Serializable fields are saved by the XML renderer, non-serializable fields
 * are not. Editable fields should also be serializable.
 * @type {boolean}
 */
Blockly.FieldTextInput.prototype.SERIALIZABLE = true;

/**
 * Pixel size of input border radius.
 * Should match blocklyText's border-radius in CSS.
 */
Blockly.FieldTextInput.BORDERRADIUS = 4;

/**
 * Mouse cursor style when over the hotspot that initiates the editor.
 */
Blockly.FieldTextInput.prototype.CURSOR = 'text';

/**
 * @override
 */
Blockly.FieldTextInput.prototype.configure_ = function(config) {
  Blockly.FieldTextInput.superClass_.configure_.call(this, config);
  if (typeof config['spellcheck'] == 'boolean') {
    this.spellcheck_ = config['spellcheck'];
  }
};

/**
 * @override
 */
Blockly.FieldTextInput.prototype.initView = function() {
  if (this.constants_.FULL_BLOCK_FIELDS) {
    // Step one: figure out if this is the only field on this block.
    // Rendering is quite different in that case.
    var nFields = 0;
    var nConnections = 0;

    // Count the number of fields, excluding text fields
    for (var i = 0, input; (input = this.sourceBlock_.inputList[i]); i++) {
      for (var j = 0; (input.fieldRow[j]); j++) {
        nFields ++;
      }
      if (input.connection) {
        nConnections++;
      }
    }
    // The special case is when this is the only non-label field on the block
    // and it has an output but no inputs.
    this.fullBlockClickTarget_ =
        nFields <= 1 && this.sourceBlock_.outputConnection && !nConnections;
  } else {
    this.fullBlockClickTarget_ = false;
  }

  if (this.fullBlockClickTarget_) {
    this.clickTarget_ = this.sourceBlock_.getSvgRoot();
  } else {
    this.createBorderRect_();
  }
  this.createTextElement_();
};

/**
 * pxt-blockly: Allow browser to auto-capitalize this field.
 * @private
 */
Blockly.FieldTextInput.prototype.autoCapitalize_ = true;

/**
 * Handle a mouse over event on a input field.
 * @param {!Event} e Mouse over event.
 * @private
 */
Blockly.FieldTextInput.prototype.onMouseOver_ = function(e) {
  if (this.sourceBlock_.isInFlyout) return;
  var gesture = this.sourceBlock_.workspace.getGesture(e);
  if (gesture && gesture.isDragging()) return;
  if (this.sourceBlock_.pathObject.svgPath) {
    Blockly.utils.dom.addClass(this.sourceBlock_.pathObject.svgPath, 'blocklyFieldHover');
  }
};

/**
 * Handle a mouse out event on a input field.
 * @param {!Event} e Mouse out event.
 * @private
 */
Blockly.FieldTextInput.prototype.onMouseOut_ = function(e) {
  if (this.sourceBlock_.isInFlyout) return;
  var gesture = this.sourceBlock_.workspace.getGesture(e);
  if (gesture && gesture.isDragging()) return;
  if (this.sourceBlock_.pathObject.svgPath) {
    Blockly.utils.dom.removeClass(this.sourceBlock_.pathObject.svgPath, 'blocklyFieldHover');
  }
};

/**
 * Close the input widget if this input is being deleted.
 */
Blockly.FieldTextInput.prototype.dispose = function() {
  if (this.mouseOverWrapper_) {
    Blockly.unbindEvent_(this.mouseOverWrapper_);
    this.mouseOverWrapper_ = null;
  }
  if (this.mouseOutWrapper_) {
    Blockly.unbindEvent_(this.mouseOutWrapper_);
    this.mouseOutWrapper_ = null;
  }
  Blockly.WidgetDiv.hideIfOwner(this);
  Blockly.FieldTextInput.superClass_.dispose.call(this);
};

/**
 * Ensure that the input value casts to a valid string.
 * @param {*=} opt_newValue The input value.
 * @return {*} A valid string, or null if invalid.
 * @protected
 */
Blockly.FieldTextInput.prototype.doClassValidation_ = function(opt_newValue) {
  if (opt_newValue === null || opt_newValue === undefined) {
    return null;
  }
  return String(opt_newValue);
};

/**
 * Called by setValue if the text input is not valid. If the field is
 * currently being edited it reverts value of the field to the previous
 * value while allowing the display text to be handled by the htmlInput_.
 * @param {*} _invalidValue The input value that was determined to be invalid.
 *    This is not used by the text input because its display value is stored on
 *    the htmlInput_.
 * @protected
 */
Blockly.FieldTextInput.prototype.doValueInvalid_ = function(_invalidValue) {
  if (this.isBeingEdited_) {
    this.isTextValid_ = false;
    var oldValue = this.value_;
    // Revert value when the text becomes invalid.
    this.value_ = this.htmlInput_.untypedDefaultValue_;
    if (this.sourceBlock_ && Blockly.Events.isEnabled()) {
      Blockly.Events.fire(new Blockly.Events.BlockChange(
          this.sourceBlock_, 'field', this.name || null, oldValue, this.value_));
    }
  }
};

/**
 * Called by setValue if the text input is valid. Updates the value of the
 * field, and updates the text of the field if it is not currently being
 * edited (i.e. handled by the htmlInput_).
 * @param {*} newValue The value to be saved. The default validator guarantees
 * that this is a string.
 * @protected
 */
Blockly.FieldTextInput.prototype.doValueUpdate_ = function(newValue) {
  this.isTextValid_ = true;
  this.value_ = newValue;
  if (!this.isBeingEdited_) {
    // This should only occur if setValue is triggered programmatically.
    this.isDirty_ = true;
  }
};

/**
 * Updates text field to match the colour/style of the block.
 * @package
 */
Blockly.FieldTextInput.prototype.applyColour = function() {
  if (this.sourceBlock_ && this.constants_.FULL_BLOCK_FIELDS) {
    if (this.borderRect_) {
      this.borderRect_.setAttribute('stroke',
          this.sourceBlock_.style.colourTertiary);
    } else {
      this.sourceBlock_.pathObject.svgPath.setAttribute('fill',
          this.constants_.FIELD_BORDER_RECT_COLOUR);
    }
  }
};

/**
 * Updates the colour of the htmlInput given the current validity of the
 * field's value.
 * @protected
 */
Blockly.FieldTextInput.prototype.render_ = function() {
  Blockly.FieldTextInput.superClass_.render_.call(this);
  // This logic is done in render_ rather than doValueInvalid_ or
  // doValueUpdate_ so that the code is more centralized.
  if (this.isBeingEdited_) {
    this.resizeEditor_();
    var htmlInput = /** @type {!HTMLElement} */(this.htmlInput_);
    if (!this.isTextValid_) {
      Blockly.utils.dom.addClass(htmlInput, 'blocklyInvalidInput');
      Blockly.utils.aria.setState(htmlInput,
          Blockly.utils.aria.State.INVALID, true);
    } else {
      Blockly.utils.dom.removeClass(htmlInput, 'blocklyInvalidInput');
      Blockly.utils.aria.setState(htmlInput,
          Blockly.utils.aria.State.INVALID, false);
    }
  }
};

/**
 * Set whether this field is spellchecked by the browser.
 * @param {boolean} check True if checked.
 */
Blockly.FieldTextInput.prototype.setSpellcheck = function(check) {
  if (check == this.spellcheck_) {
    return;
  }
  this.spellcheck_ = check;
  if (this.htmlInput_) {
    this.htmlInput_.setAttribute('spellcheck', this.spellcheck_);
  }
};

/**
 * pxt-blockly: Set whether this field is auto-capitalized by the browser.
 * @param {boolean} autoCapitalize True if auto-capitalized.
 */
Blockly.FieldTextInput.prototype.setAutoCapitalize = function(autoCapitalize) {
  this.autoCapitalize_ = autoCapitalize;
};

/**
 * Set the restrictor regex for this text input.
 * Text that doesn't match the restrictor will never show in the text field.
 * @param {?RegExp} restrictor Regular expression to restrict text.
 */
Blockly.FieldTextInput.prototype.setRestrictor = function(restrictor) {
  this.restrictor_ = restrictor;
};

/**
 * Show the inline free-text editor on top of the text.
 * @param {Event=} _opt_e Optional mouse event that triggered the field to open,
 *     or undefined if triggered programatically.
 * @param {boolean=} opt_quietInput True if editor should be created without
 *     focus.  Defaults to false.
 * @param {boolean=} opt_readOnly True if editor should be created with HTML
 *     input set to read-only, to prevent virtual keyboards.
 * @param {boolean=} opt_withArrow True to show drop-down arrow in text editor.
 * @param {Function=} opt_arrowCallback Callback for when drop-down arrow clicked.
 * @protected
 */
Blockly.FieldTextInput.prototype.showEditor_ = function(_opt_e,
    opt_quietInput, opt_readOnly, opt_withArrow, opt_arrowCallback) {
  this.workspace_ = this.sourceBlock_.workspace;
  var quietInput = opt_quietInput || false;
  var readOnly = opt_readOnly || false;
  if (!quietInput && (Blockly.utils.userAgent.MOBILE ||
                      Blockly.utils.userAgent.ANDROID ||
                      Blockly.utils.userAgent.IPAD)) {
    this.showPromptEditor_();
  } else {
    this.showInlineEditor_(quietInput, readOnly, opt_withArrow, opt_arrowCallback);
  }
};

/**
 * Create and show a text input editor that is a prompt (usually a popup).
 * Mobile browsers have issues with in-line textareas (focus and keyboards).
 * @private
 */
Blockly.FieldTextInput.prototype.showPromptEditor_ = function() {
  var fieldText = this;
  Blockly.prompt(Blockly.Msg['CHANGE_VALUE_TITLE'], this.getText(),
      function(newValue) {
        fieldText.setValue(newValue);
      });
};

/**
 * Create and show a text input editor that sits directly over the text input.
 * @param {boolean} quietInput True if editor should be created without
 *     focus.
 * @param {boolean=} withArrow True to show drop-down arrow in text editor.
 * @param {Function=} arrowCallback Callback for when drop-down arrow clicked.
 * @private
 */
Blockly.FieldTextInput.prototype.showInlineEditor_ = function(
  quietInput, readOnly, withArrow, arrowCallback) {
  Blockly.WidgetDiv.show(
      this, this.sourceBlock_.RTL, this.widgetDispose_.bind(this));
  this.htmlInput_ = this.widgetCreate_(readOnly, withArrow, arrowCallback);
  this.isBeingEdited_ = true;

  // pxtblockly: execute the arrow callback when the editor is opened as well
  if (arrowCallback) {
    arrowCallback.call(this);
  }

  if (!quietInput) {
    this.focus();
    // iOS only
    this.htmlInput_.setSelectionRange(0, 99999);
  }
};

/**
 * Create the text input editor widget.
 * @return {!HTMLElement} The newly created text input editor.
 * @param {boolean=} withArrow True to show drop-down arrow in text editor.
 * @param {Function=} arrowCallback Callback for when drop-down arrow clicked.
 * @private
 */
Blockly.FieldTextInput.prototype.widgetCreate_ = function(
    readOnly, withArrow, arrowCallback) {
  var div = Blockly.WidgetDiv.DIV;
 
  Blockly.utils.dom.addClass(this.getClickTarget_(), 'editing');

  var htmlInput = /** @type {HTMLInputElement} */ (document.createElement('input'));
  htmlInput.className = 'blocklyHtmlInput';
  htmlInput.setAttribute('spellcheck', this.spellcheck_);
  if (readOnly) {
    htmlInput.setAttribute('readonly', 'true');
  }
  // pxt-blockly: disable auto-capitalization if configured to do so.
  if (!this.autoCapitalize_) {
    htmlInput.setAttribute('autocapitalize', 'none');
  }
  var scale = this.workspace_.scale;
  var fontSize =
      (this.constants_.FIELD_TEXT_FONTSIZE * scale) + 'pt';
  div.style.fontSize = fontSize;
  htmlInput.style.fontSize = fontSize;
  var borderRadius =
      (Blockly.FieldTextInput.BORDERRADIUS * scale) + 'px';

  if (this.fullBlockClickTarget_) {
    var bBox = this.getScaledBBox();

    // Override border radius.
    borderRadius = (bBox.bottom - bBox.top) / 2 + 'px';
    // Pull stroke colour from the existing shadow block
    var strokeColour = this.sourceBlock_.getParent() ?
      this.sourceBlock_.getParent().style.colourTertiary :
      this.sourceBlock_.style.colourTertiary;
    htmlInput.style.border = (1 * scale) + 'px solid ' + strokeColour;
    div.style.borderRadius = borderRadius;
    div.style.transition = 'box-shadow 0.25s ease 0s';
    if (this.constants_.FIELD_TEXTINPUT_BOX_SHADOW) {
      div.style.boxShadow = 'rgba(255, 255, 255, 0.3) 0px 0px 0px ' +
          4 * scale + 'px';
    }
  }
  htmlInput.style.borderRadius = borderRadius;

  // TODO shakao figure out how to add arrow with new renderer
  // if (withArrow) {
  //   // Move text in input to account for displayed drop-down arrow.
  //   if (this.sourceBlock_.RTL) {
  //     htmlInput.style.paddingLeft = (this.arrowSize_ + Blockly.BlockSvg.DROPDOWN_ARROW_PADDING) + 'px';
  //   } else {
  //     htmlInput.style.paddingRight = (this.arrowSize_ + Blockly.BlockSvg.DROPDOWN_ARROW_PADDING) + 'px';
  //   }
  //   // Create the arrow.
  //   var dropDownArrow = document.createElement('img');
  //   dropDownArrow.className = 'blocklyTextDropDownArrow';
  //   dropDownArrow.style.width = this.arrowSize_ + 'px';
  //   dropDownArrow.style.height = this.arrowSize_ + 'px';
  //   dropDownArrow.style.top = this.arrowY_ + 'px';
  //   dropDownArrow.style.cursor = 'pointer';
  //   // Magic number for positioning the drop-down arrow on top of the text editor.
  //   var dropdownArrowMagic = '11px';
  //   if (this.sourceBlock_.RTL) {
  //     dropDownArrow.style.left = dropdownArrowMagic;
  //   } else {
  //     dropDownArrow.style.right = dropdownArrowMagic;
  //   }
  //   if (arrowCallback) {
  //     htmlInput.dropDownArrowMouseWrapper_ = Blockly.bindEventWithChecks_(dropDownArrow,
  //         'mousedown', this, arrowCallback);
  //   }
  //   div.appendChild(dropDownArrow);
  // }
  div.appendChild(htmlInput);

  htmlInput.value = htmlInput.defaultValue = this.getEditorText_(this.value_);
  htmlInput.untypedDefaultValue_ = this.value_;
  htmlInput.oldValue_ = null;

  this.resizeEditor_();

  this.bindInputEvents_(htmlInput);

  return htmlInput;
};

/**
 * Closes the editor, saves the results, and disposes of any events or
 * dom-references belonging to the editor.
 * @private
 */
Blockly.FieldTextInput.prototype.widgetDispose_ = function() {
  // Non-disposal related things that we do when the editor closes.
  this.isBeingEdited_ = false;
  this.isTextValid_ = true;
  // Make sure the field's node matches the field's internal value.
  this.forceRerender();
  // TODO(#2496): Make this less of a hack.
  if (this.onFinishEditing_) {
    this.onFinishEditing_(this.value_);
  }

  // Actual disposal.
  this.unbindInputEvents_();
  if (this.htmlInput_.dropDownArrowMouseWrapper_) {
    Blockly.unbindEvent_(this.htmlInput_.dropDownArrowMouseWrapper_);
  }

  var style = Blockly.WidgetDiv.DIV.style;
  style.width = 'auto';
  style.height = 'auto';
  style.fontSize = '';
  style.transition = '';
  style.boxShadow = '';
  this.htmlInput_ = null;

  Blockly.utils.dom.removeClass(this.getClickTarget_(), 'editing');
};

/**
 * Bind handlers for user input on the text input field's editor.
 * @param {!HTMLElement} htmlInput The htmlInput to which event
 *    handlers will be bound.
 * @protected
 */
Blockly.FieldTextInput.prototype.bindInputEvents_ = function(htmlInput) {
  // Trap Enter without IME and Esc to hide.
  this.onKeyDownWrapper_ =
      Blockly.bindEventWithChecks_(
          htmlInput, 'keydown', this, this.onHtmlInputKeyDown_);
  // Resize after every input change.
  this.onKeyInputWrapper_ =
      Blockly.bindEventWithChecks_(
          htmlInput, 'input', this, this.onHtmlInputChange_);
};

/**
 * Unbind handlers for user input and workspace size changes.
 * @private
 */
Blockly.FieldTextInput.prototype.unbindInputEvents_ = function() {
  if (this.onKeyDownWrapper_) {
    Blockly.unbindEvent_(this.onKeyDownWrapper_);
    this.onKeyDownWrapper_ = null;
  }
  if (this.onKeyInputWrapper_) {
    Blockly.unbindEvent_(this.onKeyInputWrapper_);
    this.onKeyInputWrapper_ = null;
  }
};

/**
 * Handle key down to the editor.
 * @param {!Event} e Keyboard event.
 * @protected
 */
Blockly.FieldTextInput.prototype.onHtmlInputKeyDown_ = function(e) {
  if (e.keyCode == Blockly.utils.KeyCodes.ENTER) {
    Blockly.WidgetDiv.hide();
    Blockly.DropDownDiv.hideWithoutAnimation();
  } else if (e.keyCode == Blockly.utils.KeyCodes.ESC) {
    this.htmlInput_.value = this.htmlInput_.defaultValue;
    Blockly.WidgetDiv.hide();
    Blockly.DropDownDiv.hideWithoutAnimation();
  } else if (e.keyCode == Blockly.utils.KeyCodes.TAB) {
    Blockly.WidgetDiv.hide();
    Blockly.DropDownDiv.hideWithoutAnimation();
    this.sourceBlock_.tab(this, !e.shiftKey);
    e.preventDefault();
  }
};

/**
 * Key codes that are whitelisted from the restrictor.
 * These are only needed and used on Gecko (Firefox).
 * See: https://github.com/LLK/scratch-blocks/issues/503.
 */
Blockly.FieldTextInput.GECKO_KEYCODE_WHITELIST = [
  97, // Select all, META-A.
  99, // Copy, META-C.
  118, // Paste, META-V.
  120 // Cut, META-X.
];

/**
 * Handle a change to the editor.
 * @param {!Event} e Keyboard event.
 * @protected pxt-blockly
 */
Blockly.FieldTextInput.prototype.onHtmlInputChange_ = function(e) {
  // Check if the key matches the restrictor.
  if (e.type === 'keypress' && this.restrictor_) {
    var keyCode;
    var isWhitelisted = false;
    if (Blockly.utils.userAgent.GECKO) {
      // e.keyCode is not available in Gecko.
      keyCode = e.charCode;
      // Gecko reports control characters (e.g., left, right, copy, paste)
      // in the key event - whitelist these from being restricted.
      // < 32 and 127 (delete) are control characters.
      // See: http://www.theasciicode.com.ar/ascii-control-characters/delete-ascii-code-127.html
      if (keyCode < 32 || keyCode == 127) {
        isWhitelisted = true;
      } else if (e.metaKey || e.ctrlKey) {
        // For combos (ctrl-v, ctrl-c, etc.), Gecko reports the ASCII letter
        // and the metaKey/ctrlKey flags.
        isWhitelisted = Blockly.FieldTextInput.GECKO_KEYCODE_WHITELIST.indexOf(keyCode) > -1;
      }
    } else {
      keyCode = e.keyCode;
    }
    var char = String.fromCharCode(keyCode);
    if (!isWhitelisted && !this.restrictor_.test(char) && e.preventDefault) {
      // Failed to pass restrictor.
      e.preventDefault();
      return;
    }
  }

  // Update source block.
  var text = this.htmlInput_.value;
  if (text !== this.htmlInput_.oldValue_) {
    this.htmlInput_.oldValue_ = text;

    // TODO(#2169): Once issue is fixed the setGroup functionality could be
    //              moved up to the Field setValue method. This would create a
    //              broader fix for all field types.
    Blockly.Events.setGroup(true);
    var value = this.getValueFromEditorText_(text);
    this.setValue(value);
    this.forceRerender();
    this.resizeEditor_();
    Blockly.Events.setGroup(false);
  }
  // Always render the input text.
  this.text_ = this.htmlInput_.value;
  this.forceRerender();
  Blockly.Events.setGroup(false);
  this.resizeEditor_();
};

/**
 * pxt-blockly: Focus and select the input.
 */
Blockly.FieldTextInput.prototype.focus = function() {
  this.htmlInput_.focus({preventScroll:true});
  this.htmlInput_.select();
};

/**
 * Set the html input value and the field's internal value. The difference
 * between this and ``setValue`` is that this also updates the html input
 * value whilst editing.
 * @param {*} newValue New value.
 * @protected
 */
Blockly.FieldTextInput.prototype.setEditorValue_ = function(newValue) {
  this.isDirty_ = true;
  if (this.isBeingEdited_) {
    // In the case this method is passed an invalid value, we still
    // pass it through the transformation method `getEditorText` to deal
    // with. Otherwise, the internal field's state will be inconsistent
    // with what's shown to the user.
    this.htmlInput_.value = this.getEditorText_(newValue);
  }
  this.setValue(newValue);
};

/**
 * Resize the editor to fit the text.
 * @protected
 */
Blockly.FieldTextInput.prototype.resizeEditor_ = function() {
  var div = Blockly.WidgetDiv.DIV;
  var bBox = this.getScaledBBox();
  div.style.width = bBox.right - bBox.left + 'px';
  div.style.height = bBox.bottom - bBox.top + 'px';

  // In RTL mode block fields and LTR input fields the left edge moves,
  // whereas the right edge is fixed.  Reposition the editor.
  var x = this.sourceBlock_.RTL ? bBox.right - div.offsetWidth : bBox.left;
  var xy = new Blockly.utils.Coordinate(x, bBox.top);

  div.style.left = xy.x + 'px';
  div.style.top = xy.y + 'px';
};

/**
 * Border radius for drawing this field, called when rendering the owning shadow block.
 * @return {Number} Border radius in px.
*/
Blockly.FieldTextInput.prototype.getBorderRadius = function() {
  if (this.sourceBlock_.getOutputShape() == Blockly.OUTPUT_SHAPE_ROUND) {
    return Blockly.BlockSvg.NUMBER_FIELD_CORNER_RADIUS;
  }
  return Blockly.BlockSvg.TEXT_FIELD_CORNER_RADIUS;
};

Blockly.FieldTextInput.prototype.maybeSaveEdit_ = function() {
  var htmlInput = this.htmlInput_;
  // Save the edit (if it validates).
  var text = htmlInput.value;
  if (this.sourceBlock_) {
    var text1 = this.callValidator(text);
    if (text1 === null) {
      // Invalid edit.
      text = htmlInput.defaultValue;
    } else {
      // Validation function has changed the text.
      text = text1;
      if (this.onFinishEditing_) {
        this.onFinishEditing_(text);
      }
    }
  }
  this.setText(text);
  this.sourceBlock_.rendered && this.sourceBlock_.render();
  // pxtblockly: Fire a UI event that an edit was complete
  if (this.sourceBlock_.workspace) {
    Blockly.Events.fire(new Blockly.Events.Ui(
        this.sourceBlock_, 'saveEdit', undefined, text));
  }
};

/**
 * Ensure that only a number may be entered.
 * @param {string} text The user's text.
 * @return {?string} A string representing a valid number, or null if invalid.
 * @deprecated
 */
Blockly.FieldTextInput.numberValidator = function(text) {
  console.warn('Blockly.FieldTextInput.numberValidator is deprecated. ' +
               'Use Blockly.FieldNumber instead.');
  if (text === null) {
    return null;
  }
  text = String(text);
  // TODO: Handle cases like 'ten', '1.203,14', etc.
  // 'O' is sometimes mistaken for '0' by inexperienced users.
  text = text.replace(/O/ig, '0');
  // Strip out thousands separators.
  text = text.replace(/,/g, '');
  var n = Number(text || 0);
  return isNaN(n) ? null : String(n);
};

/**
 * Ensure that only a non-negative integer may be entered.
 * @param {string} text The user's text.
 * @return {?string} A string representing a valid int, or null if invalid.
 * @deprecated
 */
Blockly.FieldTextInput.nonnegativeIntegerValidator = function(text) {
  var n = Blockly.FieldTextInput.numberValidator(text);
  if (n) {
    n = String(Math.max(0, Math.floor(n)));
  }
  return n;
};

/**
 * Returns whether or not the field is tab navigable.
 * @return {boolean} True if the field is tab navigable.
 * @override
 */
Blockly.FieldTextInput.prototype.isTabNavigable = function() {
  return true;
};

/**
 * Use the `getText_` developer hook to override the field's text representation.
 * When we're currently editing, return the current html value instead.
 * Otherwise, return null which tells the field to use the default behaviour
 * (which is a string cast of the field's value).
 * @return {?string} The html value if we're editing, otherwise null.
 * @protected
 * @override
 */
Blockly.FieldTextInput.prototype.getText_ = function() {
  if (this.isBeingEdited_ && this.htmlInput_) {
    // We are currently editing, return the html input value instead.
    return this.htmlInput_.value;
  }
  return null;
};

/**
 * Transform the provided value into a text to show in the html input.
 * Override this method if the field's html input representation is different
 * than the field's value. This should be coupled with an override of
 * `getValueFromEditorText_`.
 * @param {*} value The value stored in this field.
 * @return {string} The text to show on the html input.
 * @protected
 */
Blockly.FieldTextInput.prototype.getEditorText_ = function(value) {
  return String(value);
};

/**
 * Transform the text received from the html input into a value to store
 * in this field.
 * Override this method if the field's html input representation is different
 * than the field's value. This should be coupled with an override of
 * `getEditorText_`.
 * @param {string} text Text received from the html input.
 * @return {*} The value to store.
 * @protected
 */
Blockly.FieldTextInput.prototype.getValueFromEditorText_ = function(text) {
  return text;
};

Blockly.fieldRegistry.register('field_input', Blockly.FieldTextInput);
