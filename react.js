import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Upload,
  Search,
  Filter,
  Users,
  Phone,
  CheckCircle,
  XCircle,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  AlertCircle,
  Database,
  FileSpreadsheet,
  Code,
  Trash2,
  Loader2,
  LogOut,
  UserCircle
} from 'lucide-react';

/**
 * FIREBASE CONFIGURATION & INIT
 * Using Firebase Compat SDK (loaded via CDN in index.html)
 */
const auth = firebase.auth();
const db = firebase.firestore();
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

/**
 * UTILITIES
 */

// Dynamic Script Loader for SheetJS (Excel support)
const useScript = (url) => {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (document.querySelector(`script[src="${url}"]`)) {
      setLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => setLoaded(true);
    document.body.appendChild(script);
  }, [url]);
  return loaded;
};

// Robust Parser Factory

/**
 * Splits a CSV or TSV line, handling quoted values properly
 * @param {string} line - The line to split
 * @param {string} delimiter - The delimiter to use (',' or '\t')
 * @returns {string[]} - Array of parsed values
 */
const parseCsvLine = (line, delimiter) => {
  // Simple split for TSV (no quote handling needed)
  if (delimiter === '\t') {
    return line.split('\t');
  }

  // Complex parsing for CSV to handle quoted values with embedded commas
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result.map(val => val.replace(/^"|"$/g, ''));
};

/**
 * Parses Excel files (XLSX/XLS)
 * @param {File} file - The file being parsed
 * @param {string} textContent - Binary content of the file
 * @returns {Object} - Parsed headers and data
 */
const parseExcelFile = (file, textContent) => {
  if (!window.XLSX) {
    throw new Error("Excel parser not ready. Please wait a moment.");
  }

  const workbook = window.XLSX.read(textContent, { type: 'binary' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const jsonData = window.XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (jsonData.length < 2) {
    return { headers: [], data: [] };
  }

  const headers = jsonData[0];
  const data = jsonData.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] || '';
    });
    return obj;
  });

  return { headers, data: wrapData(data) };
};

/**
 * Parses SQL dump files (INSERT INTO ... VALUES format)
 * Uses heuristic parsing and may not cover all SQL dump formats
 * @param {string} textContent - Content of the SQL file
 * @returns {Object} - Parsed headers and data
 */
const parseSqlFile = (textContent) => {
  const lines = textContent.split('\n');
  const headers = [];
  const data = [];

  // Regex patterns to match INSERT statements and VALUES
  const insertRegex = /INSERT INTO `?(\w+)`? \((.*?)\) VALUES/i;
  const valuesRegex = /\((.*?)\)/g;

  let foundHeaders = false;

  lines.forEach(line => {
    // Extract column names from the first INSERT statement
    if (!foundHeaders) {
      const match = line.match(insertRegex);
      if (match) {
        match[2].split(',').forEach(h => {
          headers.push(h.trim().replace(/[`'"]/g, ''));
        });
        foundHeaders = true;
      }
    }

    // Extract values from lines containing VALUES or starting with (
    if (line.trim().startsWith('(') || line.includes('VALUES')) {
      let match;
      while ((match = valuesRegex.exec(line)) !== null) {
        const vals = match[1].split(',').map(v => v.trim().replace(/^'|'$/g, ''));
        if (vals.length === headers.length) {
          const row = {};
          headers.forEach((h, i) => {
            row[h] = vals[i];
          });
          data.push(row);
        }
      }
    }
  });

  return { headers, data: wrapData(data) };
};

/**
 * Parses CSV/TSV text files
 * @param {string} textContent - Content of the file
 * @returns {Object} - Parsed headers and data
 */
const parseCsvTsvFile = (textContent) => {
  const lines = textContent.split('\n').filter(line => line.trim() !== '');

  if (lines.length < 2) {
    return { headers: [], data: [] };
  }

  // Auto-detect delimiter (tab or comma)
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  const headers = parseCsvLine(lines[0], delimiter);
  const data = lines.slice(1).map(line => {
    const values = parseCsvLine(line, delimiter);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    return row;
  });

  return { headers, data: wrapData(data) };
};

/**
 * Main file parser - routes to appropriate parser based on file extension
 * @param {File} file - The file object to parse
 * @param {string} textContent - Content of the file
 * @returns {Promise<Object>} - Parsed headers and data
 */
const parseFile = async (file, textContent) => {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'xlsx' || ext === 'xls') {
    return parseExcelFile(file, textContent);
  }

  if (ext === 'sql') {
    return parseSqlFile(textContent);
  }

  // Default: CSV/TSV
  return parseCsvTsvFile(textContent);
};

// Helper to add system fields to raw data
const wrapData = (rawData) => {
  return rawData.map(row => ({
    ...row,
    _id: Math.random().toString(36).substr(2, 9),
    _contactHistory: [] 
  }));
};

/**
 * COMPONENTS
 */

// 0. FIREBASE UI AUTHENTICATION
const FirebaseAuthUI = ({ onSignIn }) => {
  const authContainerRef = useRef(null);

  useEffect(() => {
    // FirebaseUI configuration
    const uiConfig = {
      signInSuccessUrl: window.location.href,
      signInOptions: [
        // Email/Password
        firebase.auth.EmailAuthProvider.PROVIDER_ID,
        // Google
        firebase.auth.GoogleAuthProvider.PROVIDER_ID,
        // Anonymous (optional - for demo/testing)
        {
          provider: firebase.auth.EmailAuthProvider.PROVIDER_ID,
          requireDisplayName: true
        }
      ],
      callbacks: {
        signInSuccessWithAuthResult: function(authResult, redirectUrl) {
          // User successfully signed in
          if (onSignIn) {
            onSignIn(authResult.user);
          }
          // Avoid redirects after sign-in.
          return false;
        },
        uiShown: function() {
          // The widget is rendered, hide the loader if present
        }
      },
      // Terms of service url/callback (optional)
      tosUrl: '#',
      // Privacy policy url/callback (optional)
      privacyPolicyUrl: '#'
    };

    // Start the FirebaseUI Auth widget
    if (authContainerRef.current && window.ui) {
      window.ui.start(authContainerRef.current, uiConfig);
    }

    // Cleanup
    return () => {
      if (window.ui) {
        window.ui.reset();
      }
    };
  }, [onSignIn]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-4">
              <Users className="w-10 h-10" />
            </div>
            <h1 className="text-3xl font-bold mb-2">CivicVoice</h1>
            <p className="text-blue-100 text-sm">Voter Activation System</p>
          </div>

          {/* Auth Container */}
          <div className="p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">Welcome</h2>
            <p className="text-gray-600 text-center mb-6">Sign in to manage your voter database</p>
            <div ref={authContainerRef} id="firebaseui-auth-container"></div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-8 py-4 text-center border-t border-gray-200">
            <p className="text-xs text-gray-500">
              Secure authentication powered by Firebase
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// 1. DATA UPLOAD & MAPPING
const DataUpload = ({ onStartUpload, isUploading, uploadProgress, user }) => {
  const xlsxLoaded = useScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
  const [rawFile, setRawFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({
    firstName: '',
    lastName: '',
    address: '',
    city: '',
    party: '',
    age: '', 
    voterId: ''
  });

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setRawFile(file);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const { headers: h, data: d } = await parseFile(file, event.target.result);
        setHeaders(h);
        setParsedData(d);
        autoMap(h);
      } catch (err) {
        alert("Error parsing file: " + err.message);
        setRawFile(null);
      }
    };

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.readAsBinaryString(file);
    } else {
      reader.readAsText(file);
    }
  };

  const autoMap = (h) => {
    const newMapping = { ...mapping };
    h.forEach(header => {
      const lower = header.toLowerCase();
      if (lower.includes('first') || lower.includes('f_name')) newMapping.firstName = header;
      if (lower.includes('last') || lower.includes('l_name')) newMapping.lastName = header;
      if (lower.includes('add') || lower.includes('street')) newMapping.address = header;
      if (lower.includes('city') || lower.includes('town')) newMapping.city = header;
      if (lower.includes('party') || lower.includes('aff')) newMapping.party = header;
      if (lower.includes('age') || lower.includes('dob') || lower.includes('birth')) newMapping.age = header;
      if ((lower.includes('id') || lower.includes('num')) && !lower.includes('voter')) newMapping.voterId = header;
    });
    setMapping(newMapping);
  };

  const handleImport = () => {
    // Normalize data
    const normalizedData = parsedData.map(row => ({
      ...row,
      _sys_firstName: row[mapping.firstName] || '',
      _sys_lastName: row[mapping.lastName] || '',
      _sys_address: row[mapping.address] || '',
      _sys_city: row[mapping.city] || '',
      _sys_party: row[mapping.party] || 'Unenrolled',
      _sys_age: row[mapping.age] || '',
      _sys_voterId: row[mapping.voterId] || row._id
    }));
    onStartUpload(normalizedData);
  };

  if (isUploading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 bg-white rounded-lg shadow-lg max-w-lg mx-auto mt-20">
        <Loader2 className="w-16 h-16 text-blue-600 animate-spin mb-6" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Saving to Secure Database...</h2>
        <div className="w-full bg-gray-200 rounded-full h-4 mb-4">
          <div 
            className="bg-blue-600 h-4 rounded-full transition-all duration-300" 
            style={{ width: `${uploadProgress}%` }}
          ></div>
        </div>
        <p className="text-gray-500 text-sm">Do not close this window.</p>
      </div>
    );
  }

  if (!rawFile && !parsedData) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
        <Database className="w-16 h-16 text-blue-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Import Voter Database</h2>
        <p className="text-gray-600 mb-8 text-center max-w-md">
          Supported formats: <br/>
          <span className="inline-flex gap-2 mt-2">
            <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-mono">.csv</span>
            <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-mono">.txt</span>
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-mono">.xlsx</span>
            <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs font-mono">.sql</span>
          </span>
        </p>
        <label className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors shadow-lg">
          <span>Select File</span>
          <input type="file" accept=".csv,.txt,.xlsx,.xls,.sql" onChange={handleFileUpload} className="hidden" />
        </label>
        <div className="mt-8 p-4 bg-blue-50 text-blue-800 text-sm rounded border border-blue-100 max-w-lg flex gap-3 items-start">
           <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
           <div>
            <strong>Cloud Persistence:</strong> Uploaded data is saved to your private Firestore collection so you can resume work later.
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Settings className="w-6 h-6 text-gray-500" />
          Map Columns: {rawFile.name}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {Object.keys(mapping).map(field => (
            <div key={field} className="flex flex-col gap-1">
              <label className="text-sm font-semibold text-gray-700 capitalize">
                {field.replace(/([A-Z])/g, ' $1').trim()}
              </label>
              <select 
                value={mapping[field]}
                onChange={(e) => setMapping({...mapping, [field]: e.target.value})}
                className="p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">-- Select Column --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button 
            onClick={() => { setParsedData(null); setRawFile(null); }}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
          >
            Cancel
          </button>
          <button 
            onClick={handleImport}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 shadow"
          >
            Upload {parsedData.length} Records
          </button>
        </div>
      </div>
    </div>
  );
};

// 2. DASHBOARD WIDGETS
const StatCard = ({ title, value, sub, color = "blue" }) => {
  const colors = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    green: "bg-green-50 text-green-600 border-green-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
    orange: "bg-orange-50 text-orange-600 border-orange-100",
  };

  return (
    <div className={`p-4 rounded-lg border ${colors[color]}`}>
      <h3 className="text-sm font-medium opacity-80 uppercase tracking-wide">{title}</h3>
      <div className="text-3xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs mt-2 opacity-75">{sub}</div>}
    </div>
  );
};

// 3. VOTER TABLE
const VoterTable = ({ data, onSelect, selectedIds }) => {
  const [page, setPage] = useState(0);
  const rowsPerPage = 50;
  const paginatedData = data.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
  const totalPages = Math.ceil(data.length / rowsPerPage);

  const toggleSelectAll = () => {
    if (selectedIds.length === paginatedData.length) {
      onSelect([]);
    } else {
      onSelect(paginatedData.map(r => r._id));
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="p-3 w-10">
                <input 
                  type="checkbox" 
                  onChange={toggleSelectAll}
                  checked={paginatedData.length > 0 && selectedIds.length === paginatedData.length}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
                />
              </th>
              <th className="p-3 font-semibold text-gray-700">Name</th>
              <th className="p-3 font-semibold text-gray-700">Address</th>
              <th className="p-3 font-semibold text-gray-700">Party</th>
              <th className="p-3 font-semibold text-gray-700">Status</th>
              <th className="p-3 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedData.map(row => (
              <tr key={row._id} className={`hover:bg-blue-50 transition-colors ${selectedIds.includes(row._id) ? 'bg-blue-50' : ''}`}>
                <td className="p-3">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.includes(row._id)}
                    onChange={() => {
                      if (selectedIds.includes(row._id)) {
                        onSelect(selectedIds.filter(id => id !== row._id));
                      } else {
                        onSelect([...selectedIds, row._id]);
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
                  />
                </td>
                <td className="p-3 font-medium text-gray-900">
                  {row._sys_lastName}, {row._sys_firstName}
                </td>
                <td className="p-3 text-gray-600">
                  {row._sys_address}, {row._sys_city}
                </td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold 
                    ${(row._sys_party || '').startsWith('D') ? 'bg-blue-100 text-blue-800' : 
                      (row._sys_party || '').startsWith('R') ? 'bg-red-100 text-red-800' : 
                      'bg-gray-100 text-gray-800'}`}>
                    {row._sys_party}
                  </span>
                </td>
                <td className="p-3">
                   {row._contactHistory && row._contactHistory.length > 0 ? (
                     <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                       <CheckCircle className="w-3 h-3" /> Contacted
                     </span>
                   ) : (
                     <span className="text-gray-400 text-xs">Uncontacted</span>
                   )}
                </td>
                <td className="p-3 text-gray-400">
                  <button className="hover:text-blue-600">Details</button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan="6" className="p-8 text-center text-gray-500">
                  No records found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="bg-gray-50 p-3 border-t border-gray-200 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Showing {data.length === 0 ? 0 : page * rowsPerPage + 1} to {Math.min((page + 1) * rowsPerPage, data.length)} of {data.length} voters
        </span>
        <div className="flex gap-2">
          <button 
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium py-1">{page + 1} / {totalPages || 1}</span>
          <button 
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

// 4. MAIN APP LAYOUT
const App = () => {
  const [user, setUser] = useState(null);
  const [data, setData] = useState([]);
  const [view, setView] = useState('upload'); // upload, dashboard, list
  const [selectedIds, setSelectedIds] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Auth Init
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Data Sync (Firestore)
  useEffect(() => {
    if (!user) return;
    const unsubscribe = db.collection('artifacts').doc(appId)
      .collection('users').doc(user.uid)
      .collection('voters')
      .onSnapshot((snapshot) => {
        const voters = snapshot.docs.map(d => d.data());
        setData(voters);
        if (voters.length > 0 && view === 'upload') {
          setView('dashboard'); // Auto-switch if data exists
        }
      }, (error) => {
        console.error("Firestore Error:", error);
      });
    return () => unsubscribe();
  }, [user, view]);

  // Bulk Upload Logic
  const handleUploadToFirestore = async (voterData) => {
    if (!user) return;
    setIsUploading(true);
    setUploadProgress(0);

    const batchSize = 400; // Firestore limit is 500
    const chunks = [];
    for (let i = 0; i < voterData.length; i += batchSize) {
      chunks.push(voterData.slice(i, i + batchSize));
    }

    let processed = 0;
    try {
      // First, clear existing? Or append? Let's assume append/overwrite by ID.
      // For a "clean" slate, user should delete manually, but let's just add for now.

      for (const chunk of chunks) {
        const batch = db.batch();
        chunk.forEach(row => {
          const ref = db.collection('artifacts').doc(appId)
            .collection('users').doc(user.uid)
            .collection('voters').doc(row._id);
          batch.set(ref, row);
        });
        await batch.commit();
        processed += chunk.length;
        setUploadProgress((processed / voterData.length) * 100);
      }
      setIsUploading(false);
      setView('dashboard');
    } catch (e) {
      console.error("Upload failed", e);
      setIsUploading(false);
      alert("Upload interrupted. Please try again.");
    }
  };

  const clearDatabase = async () => {
    if (!confirm("Are you sure? This will delete all voter data permanently.")) return;
    if (!user) return;

    // Getting all docs and deleting is expensive, but necessary here
    const snapshot = await db.collection('artifacts').doc(appId)
      .collection('users').doc(user.uid)
      .collection('voters').get();
    const batch = db.batch();
    snapshot.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    setView('upload');
  };

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    party: 'All',
    city: 'All',
    status: 'All'
  });

  // Derived Data (Filtering)
  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.filter(row => {
      // Text Search
      const searchStr = `${row._sys_firstName} ${row._sys_lastName} ${row._sys_address}`.toLowerCase();
      if (searchTerm && !searchStr.includes(searchTerm.toLowerCase())) return false;

      // Dropdown Filters
      if (filters.party !== 'All' && row._sys_party !== filters.party) return false;
      if (filters.city !== 'All' && row._sys_city !== filters.city) return false;
      
      // Status Filter
      if (filters.status === 'Contacted' && (!row._contactHistory || row._contactHistory.length === 0)) return false;
      if (filters.status === 'Uncontacted' && (row._contactHistory && row._contactHistory.length > 0)) return false;

      return true;
    });
  }, [data, searchTerm, filters]);

  const uniqueParties = useMemo(() => data ? [...new Set(data.map(d => d._sys_party))].filter(Boolean).sort() : [], [data]);
  const uniqueCities = useMemo(() => data ? [...new Set(data.map(d => d._sys_city))].filter(Boolean).sort() : [], [data]);

  // Contact Logic (Write to Firestore)
  const handleBulkContact = async (type) => {
    if (!user) return;
    const batch = db.batch();

    // Find the actual rows to update from local state for reference
    const timestamp = new Date().toISOString();

    selectedIds.forEach(id => {
      const voterRef = db.collection('artifacts').doc(appId)
        .collection('users').doc(user.uid)
        .collection('voters').doc(id);
      const currentVoter = data.find(d => d._id === id);
      if (currentVoter) {
        const newHistory = [...(currentVoter._contactHistory || []), { type, date: timestamp }];
        batch.update(voterRef, { _contactHistory: newHistory });
      }
    });

    await batch.commit();
    setSelectedIds([]);
  };

  const exportList = () => {
    if (filteredData.length === 0) return;
    const headers = Object.keys(filteredData[0]).filter(k => !k.startsWith('_'));
    const csvContent = [
      headers.join(','),
      ...filteredData.map(row => headers.map(h => `"${row[h]}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "voter_export.csv");
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Sign Out Handler
  const handleSignOut = async () => {
    if (confirm("Are you sure you want to sign out?")) {
      await auth.signOut();
    }
  };

  // View Routing
  if (!user) return <FirebaseAuthUI onSignIn={(user) => setUser(user)} />;

  if (view === 'upload' && data.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
         <header className="bg-blue-900 text-white p-4 shadow-md">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6" />
              <h1 className="text-xl font-bold tracking-tight">CivicVoice <span className="font-normal opacity-70">| Data Manager</span></h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs opacity-70">{user.email || user.displayName || 'User'}</div>
              <button
                onClick={handleSignOut}
                className="p-2 hover:bg-blue-800 rounded text-blue-200"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>
        <DataUpload 
          user={user}
          onStartUpload={handleUploadToFirestore} 
          isUploading={isUploading} 
          uploadProgress={uploadProgress} 
        />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100 font-sans text-gray-900 overflow-hidden">
      {/* HEADER */}
      <header className="bg-blue-900 text-white shadow-md z-10">
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center gap-2">
             <div className="bg-blue-800 p-2 rounded">
              <Users className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none">CivicVoice</h1>
              <span className="text-xs text-blue-300">Voter Activation System</span>
            </div>
          </div>
          
          <nav className="flex gap-1 bg-blue-800/50 p-1 rounded-lg">
            <button 
              onClick={() => setView('dashboard')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${view === 'dashboard' ? 'bg-white text-blue-900 shadow' : 'text-blue-100 hover:bg-blue-800'}`}
            >
              Dashboard
            </button>
            <button 
              onClick={() => setView('list')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${view === 'list' ? 'bg-white text-blue-900 shadow' : 'text-blue-100 hover:bg-blue-800'}`}
            >
              My List
            </button>
             <button 
              onClick={() => setView('upload')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${view === 'upload' ? 'bg-white text-blue-900 shadow' : 'text-blue-100 hover:bg-blue-800'}`}
            >
              Import
            </button>
          </nav>

          <div className="flex items-center gap-3">
             <div className="text-xs text-right hidden md:block">
               <div className="opacity-80">Active File</div>
               <div className="font-semibold">{data.length.toLocaleString()} Records</div>
             </div>
             <button onClick={clearDatabase} className="p-2 hover:bg-red-800 rounded text-red-200" title="Delete All Data">
               <Trash2 className="w-5 h-5" />
             </button>
             <div className="h-8 w-px bg-blue-700"></div>
             <div className="flex items-center gap-2">
               <div className="hidden md:block text-right text-xs">
                 <div className="opacity-80">Signed in as</div>
                 <div className="font-semibold truncate max-w-[120px]">{user.email || user.displayName || 'User'}</div>
               </div>
               <button
                 onClick={handleSignOut}
                 className="p-2 hover:bg-blue-800 rounded text-blue-200 flex items-center gap-1"
                 title="Sign Out"
               >
                 <LogOut className="w-5 h-5" />
               </button>
             </div>
          </div>
        </div>
      </header>

      {/* DASHBOARD VIEW */}
      {view === 'dashboard' && (
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800">Campaign Overview</h2>
              <button onClick={() => setView('list')} className="text-blue-600 hover:text-blue-800 font-medium text-sm">View Full List &rarr;</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Total Voters" value={data.length.toLocaleString()} sub="In database" color="blue" />
              <StatCard title="Contacted" value={data.filter(d => d._contactHistory && d._contactHistory.length > 0).length.toLocaleString()} sub="Canvass attempts" color="green" />
              <StatCard title="Contact Rate" value={data.length > 0 ? `${((data.filter(d => d._contactHistory && d._contactHistory.length > 0).length / data.length) * 100).toFixed(1)}%` : '0%'} sub="Of total file" color="purple" />
              <StatCard title="Target Universe" value={filteredData.length.toLocaleString()} sub="Current filters applied" color="orange" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Party Breakdown */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-gray-400" />
                  Party Breakdown
                </h3>
                <div className="space-y-3">
                  {uniqueParties.slice(0, 8).map(party => {
                    const count = data.filter(d => d._sys_party === party).length;
                    const pct = ((count / data.length) * 100).toFixed(1);
                    return (
                      <div key={party} className="flex items-center gap-4">
                        <div className="w-24 text-sm font-medium text-gray-600 truncate">{party || 'Unknown'}</div>
                        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }}></div>
                        </div>
                        <div className="w-12 text-xs text-right text-gray-500">{pct}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Activity (Real) */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-400" />
                  Recent Actions
                </h3>
                {data.some(d => d._contactHistory && d._contactHistory.length > 0) ? (
                  <div className="space-y-4">
                    {data
                      .filter(d => d._contactHistory && d._contactHistory.length > 0)
                      .sort((a,b) => new Date(b._contactHistory[b._contactHistory.length-1].date) - new Date(a._contactHistory[a._contactHistory.length-1].date))
                      .slice(0, 5)
                      .map(d => (
                        <div key={d._id} className="flex items-start gap-3 text-sm pb-3 border-b border-gray-50 last:border-0">
                           <div className="bg-green-100 p-1.5 rounded-full text-green-700 mt-0.5">
                             <CheckCircle className="w-4 h-4" />
                           </div>
                           <div>
                             <div className="font-medium text-gray-900">
                               Contacted {d._sys_firstName} {d._sys_lastName}
                             </div>
                             <div className="text-gray-500 text-xs">
                               Action: {d._contactHistory[d._contactHistory.length-1].type}
                             </div>
                           </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="h-48 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-100 rounded">
                    <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm">No activity recorded yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* LIST VIEW */}
      {view === 'list' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Filters */}
          <aside className="w-64 bg-white border-r border-gray-200 flex flex-col z-20 shadow-sm">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                List Filters
              </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Search */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase">Search</label>
                <div className="relative">
                  <input 
                    type="text"
                    placeholder="Name or Address..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                  <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* Party Filter */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase">Party Affiliation</label>
                <select 
                  value={filters.party} 
                  onChange={(e) => setFilters({...filters, party: e.target.value})}
                  className="w-full p-2 bg-gray-50 border border-gray-200 rounded text-sm outline-none focus:border-blue-500"
                >
                  <option value="All">All Parties</option>
                  {uniqueParties.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* City Filter */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase">City / Municipality</label>
                <select 
                  value={filters.city} 
                  onChange={(e) => setFilters({...filters, city: e.target.value})}
                  className="w-full p-2 bg-gray-50 border border-gray-200 rounded text-sm outline-none focus:border-blue-500"
                >
                  <option value="All">All Cities</option>
                  {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

               {/* Status Filter */}
               <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase">Canvass Status</label>
                <div className="space-y-1">
                  {['All', 'Contacted', 'Uncontacted'].map(stat => (
                    <label key={stat} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-gray-50 rounded">
                      <input 
                        type="radio" 
                        name="status" 
                        checked={filters.status === stat}
                        onChange={() => setFilters({...filters, status: stat})}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{stat}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <div className="text-xs text-gray-500 mb-2">
                Filtering <span className="font-bold text-gray-800">{filteredData.length}</span> of {data.length}
              </div>
              <button 
                onClick={exportList}
                className="w-full py-2 bg-white border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> Export List
              </button>
            </div>
          </aside>

          {/* Main List Area */}
          <main className="flex-1 flex flex-col min-w-0 bg-white">
            {/* Toolbar */}
            <div className="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedIds.length > 0 ? (
                  <span className="text-sm font-semibold text-blue-700 bg-blue-100 px-3 py-1 rounded-full">
                    {selectedIds.length} Selected
                  </span>
                ) : (
                   <span className="text-sm text-gray-500 px-2">Select voters to log contact</span>
                )}
              </div>
              
              {selectedIds.length > 0 && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <span className="text-xs font-bold text-gray-500 uppercase mr-2">Log Contact:</span>
                  <button onClick={() => handleBulkContact('Canvassed')} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 shadow-sm">
                    <CheckCircle className="w-3 h-3" /> Canvassed
                  </button>
                   <button onClick={() => handleBulkContact('Phone')} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 shadow-sm">
                    <Phone className="w-3 h-3" /> Phone
                  </button>
                   <button onClick={() => handleBulkContact('Refused')} className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 text-xs font-bold rounded hover:bg-red-200">
                    <XCircle className="w-3 h-3" /> Refused
                  </button>
                </div>
              )}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-hidden p-4 bg-gray-100">
              <VoterTable 
                data={filteredData} 
                onSelect={setSelectedIds} 
                selectedIds={selectedIds}
              />
            </div>
          </main>
        </div>
      )}

      {/* UPLOAD VIEW */}
      {view === 'upload' && data.length > 0 && (
         <main className="flex-1 overflow-y-auto bg-gray-100">
            <DataUpload 
              user={user}
              onStartUpload={handleUploadToFirestore} 
              isUploading={isUploading} 
              uploadProgress={uploadProgress} 
            />
         </main>
      )}
    </div>
  );
};

export default App;
