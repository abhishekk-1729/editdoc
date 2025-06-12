import React, { useState, useRef } from 'react';
import { Upload, Download, Eye, Edit3, Wand2, FileText, Image, FileType, Save, Loader2, Check, X, Plus, AlertCircle, ArrowLeft } from 'lucide-react';

// API Service
class ApiService {
  constructor() {
    // Fix for process.env not defined in browser
    this.baseURL = (typeof process !== 'undefined' && process.env?.REACT_APP_API_URL) 
      ? process.env.REACT_APP_API_URL 
      : 'http://localhost:5004/api';
  }

  async uploadDocument(file) {
    if (!file) {
      throw new Error('No file provided');
    }

    const formData = new FormData();
    formData.append('document', file);

    try {
      const response = await fetch(`${this.baseURL}/documents/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = 'Upload failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Unable to connect to server. Please check if the backend is running.');
      }
      throw error;
    }
  }

  async editDocument(instruction, html, language = 'en', documentId = null) {
    if (!instruction || !html) {
      throw new Error('Instruction and HTML content are required');
    }

    try {
      const response = await fetch(`${this.baseURL}/documents/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          instruction,
          html,
          language
        })
      });

      if (!response.ok) {
        let errorMessage = 'Edit failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      return response.json();
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Unable to connect to server for editing. Please check if the backend is running.');
      }
      throw error;
    }
  }

  async convertDocument(html, format, filename = null) {
    if (!html || !format) {
      throw new Error('HTML content and format are required');
    }

    try {
      const response = await fetch(`${this.baseURL}/conversion/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, format, filename })
      });

      if (!response.ok) {
        let errorMessage = 'Conversion failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('Received empty file from server');
      }
      return blob;
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Unable to connect to server for conversion. Please check if the backend is running.');
      }
      throw error;
    }
  }

  downloadFile(blob, filename) {
    try {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'download';
      
      // Append to document, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the URL object
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error('Download error:', error);
      throw new Error('Failed to download file');
    }
  }
}

const api = new ApiService();

function App() {
  const [currentStep, setCurrentStep] = useState('upload');
  const [document, setDocument] = useState(null);
  const [htmlContent, setHtmlContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [editInstructions, setEditInstructions] = useState('');
  const [editHistory, setEditHistory] = useState([]);
  const [previewMode, setPreviewMode] = useState('desktop');
  const [error, setError] = useState(null);
  const [language, setLanguage] = useState('en');
  const fileInputRef = useRef(null);

  const handleFileUpload = async (file) => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const response = await api.uploadDocument(file);
      
      if (response && response.success && response.document) {
        setDocument(response.document);
        setHtmlContent(response.document.html || '');
        setLanguage(response.document.language || 'en');
        setCurrentStep('preview');
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleAIEdit = async () => {
    if (!editInstructions.trim()) {
      setError('Please enter an instruction');
      return;
    }
    
    if (!htmlContent) {
      setError('No document content to edit');
      return;
    }
    
    setIsProcessing(true);
    setError(null);

    try {
      const response = await api.editDocument(
        editInstructions, 
        htmlContent, 
        language, 
        document?.id
      );
      
      if (response && response.success && response.modifiedHTML) {
        setHtmlContent(response.modifiedHTML);
        setEditHistory(prev => [...prev, {
          instruction: editInstructions,
          timestamp: new Date().toLocaleString(),
          explanation: response.explanation || 'Changes applied successfully'
        }]);
        setEditInstructions('');
      } else {
        throw new Error(response?.error || 'Edit failed');
      }
    } catch (err) {
      console.error('Edit error:', err);
      setError(err.message || 'Failed to process edit instruction. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadAsFormat = async (format) => {
    if (!htmlContent) {
      setError('No document content to download');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const filename = `${document?.originalName?.split('.')[0] || 'document'}.${format}`;
      const blob = await api.convertDocument(htmlContent, format, filename);
      
      if (blob && blob.size > 0) {
        api.downloadFile(blob, filename);
      } else {
        throw new Error('Failed to generate download file');
      }
    } catch (err) {
      console.error('Download error:', err);
      setError(err.message || `Failed to download ${format.toUpperCase()} file. Please try again.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetDocument = () => {
    setDocument(null);
    setHtmlContent('');
    setEditHistory([]);
    setError(null);
    setLanguage('en');
    setCurrentStep('upload');
    setEditInstructions('');
  };

  const FileTypeIcon = ({ type }) => {
    switch (type) {
      case 'pdf': return <FileText className="w-6 h-6 text-red-500" />;
      case 'image': return <Image className="w-6 h-6 text-green-500" />;
      case 'docx': return <FileType className="w-6 h-6 text-blue-500" />;
      default: return <FileText className="w-6 h-6 text-gray-500" />;
    }
  };

  // Error Alert Component
  const ErrorAlert = ({ message, onClose }) => (
    <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-red-800 font-medium">Error</span>
        </div>
        <button onClick={onClose} className="text-red-600 hover:text-red-800">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-red-700 mt-2">{message}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Wand2 className="w-8 h-8 text-indigo-600" />
              <h1 className="text-2xl font-bold text-gray-900">AI Document Editor</h1>
            </div>
            <div className="flex items-center space-x-4">
              {currentStep !== 'upload' && (
                <button
                  onClick={resetDocument}
                  className="flex items-center space-x-2 text-gray-600 hover:text-gray-800"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Document</span>
                </button>
              )}
              <span className="text-sm text-gray-500">
                Step {currentStep === 'upload' ? '1' : currentStep === 'preview' ? '2' : '3'} of 3
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Error Display */}
        {error && (
          <ErrorAlert message={error} onClose={() => setError(null)} />
        )}

        {/* Step Indicator */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center space-x-4">
            <div className={`flex items-center space-x-2 px-4 py-2 rounded-full ${
              currentStep === 'upload' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              <Upload className="w-4 h-4" />
              <span>Upload</span>
            </div>
            <div className={`flex items-center space-x-2 px-4 py-2 rounded-full ${
              currentStep === 'preview' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              <Eye className="w-4 h-4" />
              <span>Preview</span>
            </div>
            <div className={`flex items-center space-x-2 px-4 py-2 rounded-full ${
              currentStep === 'edit' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              <Edit3 className="w-4 h-4" />
              <span>Edit</span>
            </div>
          </div>
        </div>

        {/* Upload Step */}
        {currentStep === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-8">
              <div className="text-center">
                <Upload className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload Your Document</h2>
                <p className="text-gray-600 mb-6">
                  Support for PDF, Images, Word documents, and text files
                </p>
                
                <div 
                  className="border-2 border-dashed border-indigo-300 rounded-lg p-8 mb-6 cursor-pointer hover:border-indigo-400 transition-colors"
                  onClick={() => !isProcessing && fileInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center">
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
                        <p className="text-lg font-medium text-gray-700">Processing your document...</p>
                        <p className="text-sm text-gray-500 mt-2">This may take a few moments</p>
                      </>
                    ) : (
                      <>
                        <FileText className="w-12 h-12 text-indigo-400 mb-4" />
                        <p className="text-lg font-medium text-gray-700">Click to upload or drag and drop</p>
                        <p className="text-sm text-gray-500 mt-2">PDF, DOCX, JPG, PNG, TXT up to 10MB</p>
                      </>
                    )}
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isProcessing}
                />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-red-500" />
                    <span>PDF</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <FileType className="w-4 h-4 text-blue-500" />
                    <span>Word</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Image className="w-4 h-4 text-green-500" />
                    <span>Images</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <span>Text</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview Step */}
        {currentStep === 'preview' && document && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
              <div className="bg-white rounded-lg shadow-lg">
                <div className="flex items-center justify-between p-4 border-b">
                  <div className="flex items-center space-x-3">
                    <FileTypeIcon type={document.type} />
                    <div>
                      <h3 className="text-lg font-semibold">{document.originalName}</h3>
                      <p className="text-sm text-gray-500">
                        Language: {language.toUpperCase()} | Type: {document.type?.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setPreviewMode('desktop')}
                      className={`px-3 py-1 rounded text-sm ${previewMode === 'desktop' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}
                    >
                      Desktop
                    </button>
                    <button
                      onClick={() => setPreviewMode('mobile')}
                      className={`px-3 py-1 rounded text-sm ${previewMode === 'mobile' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}
                    >
                      Mobile
                    </button>
                  </div>
                </div>
                <div className={`p-4 ${previewMode === 'mobile' ? 'max-w-sm mx-auto' : ''}`}>
                  <div 
                    className="border rounded-lg p-4 bg-gray-50 min-h-96 overflow-auto"
                    dangerouslySetInnerHTML={{ 
                      __html: htmlContent || '<p style="color: #999; text-align: center; padding: 40px;">No content to display</p>' 
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-lg shadow-lg p-4">
                <h4 className="font-semibold mb-3">Document Info</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">File Size:</span>
                    <span>{document.metadata?.fileSize ? `${Math.round(document.metadata.fileSize / 1024)} KB` : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Word Count:</span>
                    <span>{document.metadata?.wordCount || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Language:</span>
                    <span>{language.toUpperCase()}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-lg p-4">
                <h4 className="font-semibold mb-3">Quick Actions</h4>
                <div className="space-y-2">
                  <button
                    onClick={() => setCurrentStep('edit')}
                    className="w-full flex items-center justify-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Start Editing</span>
                  </button>
                  <button
                    onClick={() => downloadAsFormat('html')}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center space-x-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    <span>Download HTML</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Step */}
        {currentStep === 'edit' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Preview Panel */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-lg">
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="text-lg font-semibold">Live Preview</h3>
                  <button
                    onClick={() => setCurrentStep('preview')}
                    className="flex items-center space-x-1 text-indigo-600 hover:text-indigo-800"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Preview</span>
                  </button>
                </div>
                <div className="p-4">
                  <div 
                    className="border rounded-lg p-4 bg-gray-50 min-h-96 overflow-auto"
                    dangerouslySetInnerHTML={{ 
                      __html: htmlContent || '<p style="color: #999; text-align: center; padding: 40px;">No content to display</p>' 
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Edit Panel */}
            <div className="space-y-4">
              {/* AI Instructions */}
              <div className="bg-white rounded-lg shadow-lg p-4">
                <h4 className="font-semibold mb-3 flex items-center space-x-2">
                  <Wand2 className="w-4 h-4" />
                  <span>AI Editor</span>
                </h4>
                <textarea
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                  placeholder="Tell me what changes you want to make...

Examples:
- Change the title to 'New Title'
- Make the text bigger and blue
- Add a new paragraph about...
- Move the signature to left side
- Change font to Arial
- Add borders to tables"
                  className="w-full h-32 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  disabled={isProcessing}
                />
                <button
                  onClick={handleAIEdit}
                  disabled={isProcessing || !editInstructions.trim()}
                  className="w-full mt-3 flex items-center justify-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      <span>Apply Changes</span>
                    </>
                  )}
                </button>
              </div>

              {/* Edit History */}
              {editHistory.length > 0 && (
                <div className="bg-white rounded-lg shadow-lg p-4">
                  <h4 className="font-semibold mb-3">Edit History</h4>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {editHistory.slice(-5).map((edit, index) => (
                      <div key={index} className="text-sm p-2 bg-gray-50 rounded">
                        <p className="font-medium text-gray-800">{edit.instruction}</p>
                        <p className="text-gray-500 text-xs">{edit.timestamp}</p>
                      </div>
                    ))}
                  </div>
                  {editHistory.length > 5 && (
                    <p className="text-xs text-gray-500 mt-2">Showing last 5 edits</p>
                  )}
                </div>
              )}

              {/* Download Options */}
              <div className="bg-white rounded-lg shadow-lg p-4">
                <h4 className="font-semibold mb-3">Download Options</h4>
                <div className="space-y-2">
                  <button
                    onClick={() => downloadAsFormat('html')}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center space-x-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    <FileText className="w-4 h-4" />
                    <span>HTML</span>
                  </button>
                  <button
                    onClick={() => downloadAsFormat('pdf')}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center space-x-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    <FileText className="w-4 h-4" />
                    <span>PDF</span>
                  </button>
                  <button
                    onClick={() => downloadAsFormat('docx')}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    <FileType className="w-4 h-4" />
                    <span>Word Document</span>
                  </button>
                  <button
                    onClick={() => downloadAsFormat('png')}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    <Image className="w-4 h-4" />
                    <span>PNG Image</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;