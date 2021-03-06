import React from 'react';
require('pdfjs-dist/build/pdf.combined');

class Pdf extends React.Component {
  constructor(props) {
    super(props);
    this.state = {};
    this.onGetPdfRaw = this.onGetPdfRaw.bind(this);
    this.onDocumentComplete = this.onDocumentComplete.bind(this);
    this.onPageComplete = this.onPageComplete.bind(this);
  }

  componentDidMount() {
    this.loadPDFDocument(this.props);
    this.renderPdf();
  }

  // Not sure... Would this helpful?
  // componentWillUnmount() {
  //   const {pdf} = this.state;
  //   pdf.destroy();
  // }

  componentWillReceiveProps(newProps) {
    const { pdf } = this.state;

    // Only reload iff the most significant source
    // has changed!
    let newSource = newProps.file;
    let oldSource = newSource ? this.props.file : null;
    newSource = newSource || newProps.binaryContent;
    oldSource = newSource && !oldSource ? this.props.binaryContent : oldSource;
    newSource = newSource || newProps.content;
    oldSource = newSource && !oldSource ? this.props.content : oldSource;

    if (newSource && newSource !== oldSource) {
      this.loadPDFDocument(newProps);
    }

    if (pdf && ((newProps.page && newProps.page !== this.props.page) ||
      (newProps.scale && newProps.scale !== this.props.scale))) {
      this.setState({ page: null });
      pdf.getPage(newProps.page).then(this.onPageComplete);
    }
  }

  onGetPdfRaw(pdfRaw) {
    const {onContentAvailable, onBinaryContentAvailable, binaryToBase64} = this.props;
    if (typeof onBinaryContentAvailable === 'function') {
      onBinaryContentAvailable(pdfRaw);
    }
    if (typeof onContentAvailable === 'function') {
      var convertBinaryToBase64 = this.defaultBinaryToBase64;
      if (typeof binaryToBase64 === 'function') {
        convertBinaryToBase64 = binaryToBase64;
      }
      onContentAvailable(convertBinaryToBase64(pdfRaw));
    }
  }

  onDocumentComplete(pdf) {
    this.setState({ pdf });
    const { onDocumentComplete, onContentAvailable, onBinaryContentAvailable } = this.props;
    if (typeof onDocumentComplete === 'function') {
      onDocumentComplete(pdf.numPages);
    }
    if (typeof onContentAvailable === 'function' || typeof onBinaryContentAvailable === 'function') {
      pdf.getData().then(this.onGetPdfRaw);
    }
    pdf.getPage(this.props.page).then(this.onPageComplete);
  }

  onPageComplete(page) {
    this.setState({ page });
    this.renderPdf();
    const { onPageComplete } = this.props;
    if (typeof onPageComplete === 'function') {
      onPageComplete(page.pageIndex + 1);
    }
  }

  loadByteArray(byteArray) {
    window.PDFJS.getDocument(byteArray).then(this.onDocumentComplete);
  }

  loadPDFDocument(props) {
    if (!!props.file) {
      if (typeof props.file === 'string') {
        return window.PDFJS.getDocument(props.file)
          .then(this.onDocumentComplete);
      }
      // Is a File object
      const reader = new FileReader();
      reader.onloadend = () =>
        this.loadByteArray(new Uint8Array(reader.result));
      reader.readAsArrayBuffer(props.file);
    } else if (props.binaryContent) {
      this.loadByteArray(props.binaryContent);
    } else if (props.content) {
      const bytes = window.atob(props.content);
      const byteLength = bytes.length;
      const byteArray = new Uint8Array(new ArrayBuffer(byteLength));
      for (let index = 0; index < byteLength; index++) {
        byteArray[index] = bytes.charCodeAt(index);
      }
      this.loadByteArray(byteArray);
    } else {
      throw new Error('react-pdf-js works with a file(URL) or (base64)content. At least one needs to be provided!');
    }
  }

  renderPdf() {
    const { page } = this.state;
    if (page) {
      const { canvas } = this.refs;
      const canvasContext = canvas.getContext('2d');
      const { scale } = this.props;
      const viewport = page.getViewport(scale);
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      page.render({ canvasContext, viewport });
    }
  }

  render() {
    const { loading } = this.props;
    const { page } = this.state;
    return page ? <canvas ref="canvas" /> : loading || <div>Loading PDF...</div>;
  }

  // Converts an ArrayBuffer directly to base64, without any intermediate 'convert to string then
  // use window.btoa' step and without risking a blow of the stack. According to [Jon Leightons's]
  // tests, this appears to be a faster approach: http://jsperf.com/encoding-xhr-image-data/5
  // Jon Leighton https://gist.github.com/jonleighton/958841
  defaultBinaryToBase64(arrayBuffer) {
    var base64 = '';
    var encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    var bytes = new Uint8Array(arrayBuffer);
    var byteLength = bytes.byteLength;
    var byteRemainder = byteLength % 3;
    var mainLength = byteLength - byteRemainder;

    var a, b, c, d;
    var chunk;

    // Main loop deals with bytes in chunks of 3
    for (var i = 0; i < mainLength; i = i + 3) {
      // Combine the three bytes into a single integer
      chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

      // Use bitmasks to extract 6-bit segments from the triplet
      a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
      b = (chunk & 258048) >> 12; // 258048   = (2^6 - 1) << 12
      c = (chunk & 4032) >> 6; // 4032     = (2^6 - 1) << 6
      d = chunk & 63;               // 63       = 2^6 - 1

      // Convert the raw binary segments to the appropriate ASCII encoding
      base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
    }

    // Deal with the remaining bytes and padding
    if (byteRemainder === 1) {
      chunk = bytes[mainLength];

      a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2

      // Set the 4 least significant bits to zero
      b = (chunk & 3) << 4; // 3   = 2^2 - 1

      base64 += encodings[a] + encodings[b] + '=='
    } else if (byteRemainder === 2) {
      chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];

      a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
      b = (chunk & 1008) >> 4; // 1008  = (2^6 - 1) << 4

      // Set the 2 least significant bits to zero
      c = (chunk & 15) << 2; // 15    = 2^4 - 1

      base64 += encodings[a] + encodings[b] + encodings[c] + '=';
    }

    return base64
  }

}
Pdf.displayName = 'react-pdf-js';
Pdf.propTypes = {
  content: React.PropTypes.string,
  binaryContent: React.PropTypes.object,
  file: React.PropTypes.any, // Could be File object or URL string.
  loading: React.PropTypes.any,
  page: React.PropTypes.number,
  scale: React.PropTypes.number,
  onContentAvailable: React.PropTypes.func,
  onBinaryContentAvailable: React.PropTypes.func.isRequired,
  binaryToBase64: React.PropTypes.func,
  onDocumentComplete: React.PropTypes.func,
  onPageComplete: React.PropTypes.func,
};
Pdf.defaultProps = { page: 1, scale: 1.0 };

export default Pdf;
