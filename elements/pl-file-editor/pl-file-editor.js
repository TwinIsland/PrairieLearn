/* eslint-env browser,jquery */
/* global ace, showdown, MathJax, filterXSS */

window.PLFileEditor = function (uuid, options) {
  var elementId = '#file-editor-' + uuid;
  this.element = $(elementId);
  if (!this.element) {
    throw new Error('File upload element ' + elementId + ' was not found!');
  }
  this.originalContents = options.originalContents || '';

  this.inputElement = this.element.find('input');
  this.editorElement = this.element.find('.editor');
  this.settingsButton = this.element.find('.settings-button');
  this.modal = this.element.find('.modal');
  this.saveSettingsButton = this.element.find('.save-settings-button');
  this.closeSettingsButton = this.element.find('.close-settings-button');
  this.restoreOriginalButton = this.element.find('.restore-original');
  this.restoreOriginalConfirmContainer = this.element.find('.restore-original-confirm-container');
  this.restoreOriginalConfirm = this.element.find('.restore-original-confirm');
  this.restoreOriginalCancel = this.element.find('.restore-original-cancel');
  this.editor = ace.edit(this.editorElement.get(0));
  this.editor.setTheme('ace/theme/chrome');
  this.editor.getSession().setUseWrapMode(true);
  this.editor.setShowPrintMargin(false);
  this.editor.setReadOnly(options.readOnly);
  this.editor.getSession().on('change', this.syncFileToHiddenInput.bind(this));

  if (options.aceMode) {
    this.editor.getSession().setMode(options.aceMode);
  }

  if (localStorage.getItem('pl-file-editor-theme')) {
    this.editor.setTheme(localStorage.getItem('pl-file-editor-theme'));
  } else if (options.aceTheme) {
    this.editor.setTheme(options.aceTheme);
  } else {
    this.editor.setTheme('ace/theme/chrome');
  }

  if (options.fontSize) {
    this.editor.setFontSize(options.fontSize);
  }

  if (options.minLines) {
    this.editor.setOption('minLines', options.minLines);
  }

  if (options.maxLines) {
    this.editor.setOption('maxLines', options.maxLines);
  }

  if (options.autoResize) {
    this.editor.setAutoScrollEditorIntoView(true);
    this.editor.setOption('maxLines', Infinity);
  }

  this.plOptionFocus = options.plOptionFocus;

  if (options.preview === 'markdown') {
    let renderer = new showdown.Converter({
      literalMidWordUnderscores: true,
      literalMidWordAsterisks: true,
    });

    this.editor.session.on('change', () => {
      this.updatePreview(renderer.makeHtml(this.editor.getValue()));
    });
    this.updatePreview(renderer.makeHtml(this.editor.getValue()));
  } else if (options.preview === 'html') {
    this.editor.session.on('change', () => {
      this.updatePreview(this.editor.getValue());
    });
    this.updatePreview(this.editor.getValue());
  } else if (options.preview !== undefined) {
    let preview = this.element.find('.preview')[0];
    preview.innerHTML = '<p>Unknown preview type: <code>' + options.preview + '</code></p>';
  }

  var currentContents = '';
  if (options.currentContents) {
    currentContents = this.b64DecodeUnicode(options.currentContents);
  }
  this.setEditorContents(currentContents);

  this.syncSettings();

  this.initSettingsButton(uuid);

  this.initRestoreOriginalButton();
};

window.PLFileEditor.prototype.syncSettings = function () {
  window.addEventListener('storage', (event) => {
    if (event.key === 'pl-file-editor-theme') {
      this.editor.setTheme(event.newValue);
    }
  });

  window.addEventListener('pl-file-editor-settings-changed', () => {
    this.editor.setTheme(localStorage.getItem('pl-file-editor-theme'));
  });
};

window.PLFileEditor.prototype.updatePreview = function (html_contents) {
  const default_preview_text = '<p>Begin typing above to preview</p>';
  let preview = this.element.find('.preview')[0];
  if (html_contents.trim().length === 0) {
    preview.innerHTML = default_preview_text;
  } else {
    let sanitized_contents = filterXSS(html_contents);
    preview.innerHTML = sanitized_contents;
    if (
      sanitized_contents.includes('$') ||
      sanitized_contents.includes('\\(') ||
      sanitized_contents.includes('\\)') ||
      sanitized_contents.includes('\\[') ||
      sanitized_contents.includes('\\]')
    ) {
      MathJax.typesetPromise();
    }
  }
};

window.PLFileEditor.prototype.initSettingsButton = function (uuid) {
  var that = this;

  this.settingsButton.click(function () {
    ace.require(['ace/ext/themelist'], function (themeList) {
      var themeSelect = that.modal.find('#modal-' + uuid + '-themes');
      themeSelect.empty();
      for (const entries in themeList.themesByName) {
        var caption = themeList.themesByName[entries].caption;
        var theme = themeList.themesByName[entries].theme;

        themeSelect.append(
          $('<option>', {
            value: theme,
            text: caption,
            selected: localStorage.getItem('pl-file-editor-theme') === theme,
          })
        );
      }
    });
    that.modal.modal('show');
    sessionStorage.setItem('pl-file-editor-theme-current', that.editor.getTheme());
    that.modal.find('#modal-' + uuid + '-themes').change(function () {
      var theme = $(this).val();
      that.editor.setTheme(theme);
    });
  });

  this.saveSettingsButton.click(function () {
    var theme = that.modal.find('#modal-' + uuid + '-themes').val();
    that.editor.setTheme(theme);
    localStorage.setItem('pl-file-editor-theme', theme);
    sessionStorage.removeItem('pl-file-editor-theme-current');
    window.dispatchEvent(new Event('pl-file-editor-settings-changed'));
    that.modal.modal('hide');
  });

  this.closeSettingsButton.click(function () {
    that.editor.setTheme(sessionStorage.getItem('pl-file-editor-theme-current'));
    sessionStorage.removeItem('pl-file-editor-theme-current');
  });
};

window.PLFileEditor.prototype.initRestoreOriginalButton = function () {
  var that = this;
  this.restoreOriginalButton.click(function () {
    that.restoreOriginalButton.hide();
    that.restoreOriginalConfirmContainer.show();
  });

  this.restoreOriginalConfirm.click(function () {
    that.restoreOriginalConfirmContainer.hide();
    that.restoreOriginalButton.show();
    that.setEditorContents(that.b64DecodeUnicode(that.originalContents));
  });

  this.restoreOriginalCancel.click(function () {
    that.restoreOriginalConfirmContainer.hide();
    that.restoreOriginalButton.show();
  });
};

window.PLFileEditor.prototype.setEditorContents = function (contents) {
  this.editor.setValue(contents);
  this.editor.gotoLine(1, 0);
  if (this.plOptionFocus) {
    this.editor.focus();
  }
  this.syncFileToHiddenInput();
};

window.PLFileEditor.prototype.syncFileToHiddenInput = function () {
  this.inputElement.val(this.b64EncodeUnicode(this.editor.getValue()));
};

window.PLFileEditor.prototype.b64DecodeUnicode = function (str) {
  // Going backwards: from bytestream, to percent-encoding, to original string.
  return decodeURIComponent(
    atob(str)
      .split('')
      .map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join('')
  );
};

window.PLFileEditor.prototype.b64EncodeUnicode = function (str) {
  // first we use encodeURIComponent to get percent-encoded UTF-8,
  // then we convert the percent encodings into raw bytes which
  // can be fed into btoa.
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function toSolidBytes(match, p1) {
      return String.fromCharCode('0x' + p1);
    })
  );
};
