/**
 * CivicVoice Voter Query Builder & Map Interface
 * Advanced voter data querying, list management, and turf cutting
 */

const { useState, useEffect, useCallback, useMemo, useRef } = React;

// API Configuration
const API_BASE = window.CIVICVOICE_API_URL || 'http://localhost:3001/api';

// Utility function for API calls
async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('civicvoice_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// ============================================================================
// Query Builder Component
// ============================================================================

function QueryBuilder({ onQueryChange, onSearch, initialConfig = {} }) {
  const [config, setConfig] = useState({
    county: [],
    precincts: [],
    congressional_district: '',
    nc_senate_district: '',
    nc_house_district: '',
    municipalities: [],
    zip_codes: [],
    age_min: null,
    age_max: null,
    sex: [],
    race: [],
    ethnicity: [],
    party: [],
    registration_status: 'ACTIVE',
    turnout_min: null,
    turnout_max: null,
    partisan_min: null,
    partisan_max: null,
    voted_in: [],
    did_not_vote_in: [],
    primary_party: '',
    voting_method: [],
    search: '',
    ...initialConfig,
  });

  const [options, setOptions] = useState(null);
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load filter options
  useEffect(() => {
    apiCall('/query/options')
      .then(setOptions)
      .catch(err => setError(err.message));
  }, []);

  // Update count when config changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      updateCount();
    }, 300);
    return () => clearTimeout(timer);
  }, [config]);

  const updateCount = async () => {
    try {
      const result = await apiCall('/query/count', {
        method: 'POST',
        body: JSON.stringify(config),
      });
      setCount(result.count);
      if (onQueryChange) onQueryChange(config, result.count);
    } catch (err) {
      console.error('Count error:', err);
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('/query/build', {
        method: 'POST',
        body: JSON.stringify({ ...config, limit: 100 }),
      });
      if (onSearch) onSearch(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const toggleArrayValue = (key, value) => {
    setConfig(prev => {
      const arr = prev[key] || [];
      const exists = arr.includes(value);
      return {
        ...prev,
        [key]: exists ? arr.filter(v => v !== value) : [...arr, value],
      };
    });
  };

  const clearAll = () => {
    setConfig({
      county: [],
      precincts: [],
      congressional_district: '',
      nc_senate_district: '',
      nc_house_district: '',
      municipalities: [],
      zip_codes: [],
      age_min: null,
      age_max: null,
      sex: [],
      race: [],
      ethnicity: [],
      party: [],
      registration_status: 'ACTIVE',
      turnout_min: null,
      turnout_max: null,
      partisan_min: null,
      partisan_max: null,
      voted_in: [],
      did_not_vote_in: [],
      primary_party: '',
      voting_method: [],
      search: '',
    });
  };

  if (!options) {
    return React.createElement('div', { className: 'p-4 text-gray-500' }, 'Loading options...');
  }

  return React.createElement('div', { className: 'bg-white rounded-lg shadow-lg p-6' },
    // Header with count
    React.createElement('div', { className: 'flex justify-between items-center mb-6' },
      React.createElement('h2', { className: 'text-xl font-bold text-gray-800' }, 'Query Builder'),
      React.createElement('div', { className: 'flex items-center gap-4' },
        count !== null && React.createElement('span', {
          className: 'text-2xl font-bold text-blue-600'
        }, count.toLocaleString(), ' voters'),
        React.createElement('button', {
          onClick: clearAll,
          className: 'text-sm text-gray-500 hover:text-gray-700'
        }, 'Clear All')
      )
    ),

    // Error display
    error && React.createElement('div', {
      className: 'mb-4 p-3 bg-red-100 text-red-700 rounded'
    }, error),

    // Filter sections
    React.createElement('div', { className: 'space-y-6' },

      // Geography Section
      React.createElement(FilterSection, { title: 'Geography', icon: '🗺️' },
        React.createElement('div', { className: 'grid grid-cols-2 gap-4' },
          // County
          React.createElement(MultiSelect, {
            label: 'County',
            options: options.counties,
            selected: config.county,
            onChange: (val) => updateConfig('county', val),
          }),
          // Precinct
          React.createElement(MultiSelect, {
            label: 'Precinct',
            options: options.precincts,
            selected: config.precincts,
            onChange: (val) => updateConfig('precincts', val),
          }),
          // Congressional District
          React.createElement(SingleSelect, {
            label: 'Congressional District',
            options: options.congressionalDistricts,
            value: config.congressional_district,
            onChange: (val) => updateConfig('congressional_district', val),
          }),
          // Municipality
          React.createElement(MultiSelect, {
            label: 'Municipality',
            options: options.municipalities,
            selected: config.municipalities,
            onChange: (val) => updateConfig('municipalities', val),
          }),
        )
      ),

      // Demographics Section
      React.createElement(FilterSection, { title: 'Demographics', icon: '👥' },
        React.createElement('div', { className: 'grid grid-cols-2 gap-4' },
          // Age Range
          React.createElement('div', null,
            React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, 'Age Range'),
            React.createElement('div', { className: 'flex gap-2' },
              React.createElement('input', {
                type: 'number',
                placeholder: 'Min',
                value: config.age_min || '',
                onChange: (e) => updateConfig('age_min', e.target.value ? parseInt(e.target.value) : null),
                className: 'w-20 px-2 py-1 border rounded',
              }),
              React.createElement('span', { className: 'self-center' }, '-'),
              React.createElement('input', {
                type: 'number',
                placeholder: 'Max',
                value: config.age_max || '',
                onChange: (e) => updateConfig('age_max', e.target.value ? parseInt(e.target.value) : null),
                className: 'w-20 px-2 py-1 border rounded',
              })
            )
          ),
          // Sex
          React.createElement(CheckboxGroup, {
            label: 'Sex',
            options: ['Female', 'Male', 'Unknown'],
            selected: config.sex,
            onChange: (val) => toggleArrayValue('sex', val),
          }),
          // Race
          React.createElement(MultiSelect, {
            label: 'Race',
            options: options.races,
            selected: config.race,
            onChange: (val) => updateConfig('race', val),
          }),
          // Ethnicity
          React.createElement(MultiSelect, {
            label: 'Ethnicity',
            options: options.ethnicities,
            selected: config.ethnicity,
            onChange: (val) => updateConfig('ethnicity', val),
          }),
        )
      ),

      // Party & Registration Section
      React.createElement(FilterSection, { title: 'Party & Registration', icon: '🗳️' },
        React.createElement('div', { className: 'grid grid-cols-2 gap-4' },
          // Party Affiliation
          React.createElement(CheckboxGroup, {
            label: 'Party Affiliation',
            options: options.parties.map(p => p.party),
            selected: config.party,
            onChange: (val) => toggleArrayValue('party', val),
            counts: options.parties.reduce((acc, p) => ({ ...acc, [p.party]: p.count }), {}),
          }),
          // Registration Status
          React.createElement(SingleSelect, {
            label: 'Registration Status',
            options: ['ACTIVE', 'INACTIVE', 'REMOVED'],
            value: config.registration_status,
            onChange: (val) => updateConfig('registration_status', val),
          }),
        )
      ),

      // Vote History Section
      React.createElement(FilterSection, { title: 'Vote History', icon: '📊' },
        React.createElement('div', { className: 'space-y-4' },
          // Elections dropdown
          options.elections && options.elections.length > 0 && React.createElement('div', null,
            React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Voted In'),
            React.createElement('div', { className: 'max-h-40 overflow-y-auto border rounded p-2' },
              options.elections.map(election =>
                React.createElement('label', {
                  key: election.election_date,
                  className: 'flex items-center gap-2 py-1 hover:bg-gray-50'
                },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: config.voted_in.some(e => e.date === election.election_date),
                    onChange: () => {
                      const exists = config.voted_in.some(e => e.date === election.election_date);
                      updateConfig('voted_in', exists
                        ? config.voted_in.filter(e => e.date !== election.election_date)
                        : [...config.voted_in, { date: election.election_date, type: election.election_type }]
                      );
                    },
                    className: 'rounded',
                  }),
                  React.createElement('span', { className: 'text-sm' },
                    `${election.election_date} - ${election.election_desc}`
                  ),
                  React.createElement('span', { className: 'text-xs text-gray-500' },
                    `(${election.total_voters?.toLocaleString() || 0})`
                  )
                )
              )
            )
          ),

          // Voting method filter
          React.createElement(CheckboxGroup, {
            label: 'Voting Method',
            options: options.votingMethods,
            selected: config.voting_method,
            onChange: (val) => toggleArrayValue('voting_method', val),
          }),

          // Primary participation
          React.createElement(SingleSelect, {
            label: 'Voted in Primary (Party)',
            options: ['', 'DEM', 'REP', 'LIB', 'GRE'],
            value: config.primary_party,
            onChange: (val) => updateConfig('primary_party', val),
          }),
        )
      ),

      // Scores Section
      React.createElement(FilterSection, { title: 'Scores', icon: '📈' },
        React.createElement('div', { className: 'grid grid-cols-2 gap-4' },
          // Turnout Score
          React.createElement('div', null,
            React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' },
              'Turnout Score (%)'
            ),
            React.createElement('div', { className: 'flex gap-2' },
              React.createElement('input', {
                type: 'number',
                placeholder: 'Min',
                min: 0,
                max: 100,
                value: config.turnout_min || '',
                onChange: (e) => updateConfig('turnout_min', e.target.value ? parseInt(e.target.value) : null),
                className: 'w-20 px-2 py-1 border rounded',
              }),
              React.createElement('span', { className: 'self-center' }, '-'),
              React.createElement('input', {
                type: 'number',
                placeholder: 'Max',
                min: 0,
                max: 100,
                value: config.turnout_max || '',
                onChange: (e) => updateConfig('turnout_max', e.target.value ? parseInt(e.target.value) : null),
                className: 'w-20 px-2 py-1 border rounded',
              })
            )
          ),
          // Partisan Score
          React.createElement('div', null,
            React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' },
              'Partisan Score (-100 Dem to +100 Rep)'
            ),
            React.createElement('div', { className: 'flex gap-2' },
              React.createElement('input', {
                type: 'number',
                placeholder: 'Min',
                min: -100,
                max: 100,
                value: config.partisan_min ?? '',
                onChange: (e) => updateConfig('partisan_min', e.target.value !== '' ? parseInt(e.target.value) : null),
                className: 'w-20 px-2 py-1 border rounded',
              }),
              React.createElement('span', { className: 'self-center' }, '-'),
              React.createElement('input', {
                type: 'number',
                placeholder: 'Max',
                min: -100,
                max: 100,
                value: config.partisan_max ?? '',
                onChange: (e) => updateConfig('partisan_max', e.target.value !== '' ? parseInt(e.target.value) : null),
                className: 'w-20 px-2 py-1 border rounded',
              })
            )
          ),
        )
      ),

      // Search box
      React.createElement('div', null,
        React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' },
          'Search Name/Address'
        ),
        React.createElement('input', {
          type: 'text',
          placeholder: 'Search by name or address...',
          value: config.search,
          onChange: (e) => updateConfig('search', e.target.value),
          className: 'w-full px-3 py-2 border rounded-lg',
        })
      ),
    ),

    // Action buttons
    React.createElement('div', { className: 'mt-6 flex gap-4' },
      React.createElement('button', {
        onClick: handleSearch,
        disabled: loading,
        className: 'flex-1 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50'
      }, loading ? 'Searching...' : 'Search Voters'),
      React.createElement('button', {
        onClick: () => {
          const name = prompt('Enter a name for this saved query:');
          if (name) {
            apiCall('/query/save', {
              method: 'POST',
              body: JSON.stringify({ name, query_config: config }),
            }).then(() => alert('Query saved!')).catch(err => alert(err.message));
          }
        },
        className: 'px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50'
      }, 'Save Query')
    )
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function FilterSection({ title, icon, children }) {
  const [isOpen, setIsOpen] = useState(true);

  return React.createElement('div', { className: 'border rounded-lg' },
    React.createElement('button', {
      onClick: () => setIsOpen(!isOpen),
      className: 'w-full px-4 py-3 flex items-center justify-between bg-gray-50 rounded-t-lg'
    },
      React.createElement('span', { className: 'font-medium' }, icon, ' ', title),
      React.createElement('span', { className: 'text-gray-500' }, isOpen ? '▼' : '▶')
    ),
    isOpen && React.createElement('div', { className: 'p-4' }, children)
  );
}

function MultiSelect({ label, options, selected, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return React.createElement('div', { className: 'relative' },
    React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, label),
    React.createElement('div', {
      onClick: () => setIsOpen(!isOpen),
      className: 'border rounded px-3 py-2 cursor-pointer bg-white min-h-[38px]'
    },
      selected.length > 0
        ? React.createElement('div', { className: 'flex flex-wrap gap-1' },
            selected.map(s => React.createElement('span', {
              key: s,
              className: 'bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded'
            }, s))
          )
        : React.createElement('span', { className: 'text-gray-400' }, 'Select...')
    ),
    isOpen && React.createElement('div', {
      className: 'absolute z-10 w-full mt-1 bg-white border rounded shadow-lg max-h-60 overflow-auto'
    },
      React.createElement('input', {
        type: 'text',
        placeholder: 'Search...',
        value: search,
        onChange: (e) => setSearch(e.target.value),
        className: 'w-full px-3 py-2 border-b',
        onClick: (e) => e.stopPropagation(),
      }),
      filteredOptions.slice(0, 100).map(opt =>
        React.createElement('label', {
          key: opt,
          className: 'flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer'
        },
          React.createElement('input', {
            type: 'checkbox',
            checked: selected.includes(opt),
            onChange: () => {
              const newSelected = selected.includes(opt)
                ? selected.filter(s => s !== opt)
                : [...selected, opt];
              onChange(newSelected);
            },
          }),
          opt
        )
      )
    )
  );
}

function SingleSelect({ label, options, value, onChange }) {
  return React.createElement('div', null,
    React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, label),
    React.createElement('select', {
      value: value,
      onChange: (e) => onChange(e.target.value),
      className: 'w-full border rounded px-3 py-2'
    },
      React.createElement('option', { value: '' }, 'All'),
      options.map(opt =>
        React.createElement('option', { key: opt, value: opt }, opt)
      )
    )
  );
}

function CheckboxGroup({ label, options, selected, onChange, counts = {} }) {
  return React.createElement('div', null,
    React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, label),
    React.createElement('div', { className: 'flex flex-wrap gap-2' },
      options.map(opt =>
        React.createElement('label', {
          key: opt,
          className: `flex items-center gap-1 px-2 py-1 rounded cursor-pointer ${
            selected.includes(opt) ? 'bg-blue-100 text-blue-800' : 'bg-gray-100'
          }`
        },
          React.createElement('input', {
            type: 'checkbox',
            checked: selected.includes(opt),
            onChange: () => onChange(opt),
            className: 'sr-only',
          }),
          opt,
          counts[opt] && React.createElement('span', { className: 'text-xs opacity-70' },
            `(${counts[opt].toLocaleString()})`
          )
        )
      )
    )
  );
}

// ============================================================================
// Voter Results Table
// ============================================================================

function VoterResultsTable({ voters, total, onLoadMore, onSelectVoters, onCreateList }) {
  const [selected, setSelected] = useState(new Set());
  const [sortBy, setSortBy] = useState('last_name');
  const [sortDir, setSortDir] = useState('asc');

  const toggleSelect = (ncid) => {
    const newSelected = new Set(selected);
    if (newSelected.has(ncid)) {
      newSelected.delete(ncid);
    } else {
      newSelected.add(ncid);
    }
    setSelected(newSelected);
    if (onSelectVoters) onSelectVoters(Array.from(newSelected));
  };

  const toggleSelectAll = () => {
    if (selected.size === voters.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(voters.map(v => v.ncid)));
    }
  };

  return React.createElement('div', { className: 'bg-white rounded-lg shadow-lg' },
    // Header
    React.createElement('div', { className: 'p-4 border-b flex justify-between items-center' },
      React.createElement('div', null,
        React.createElement('span', { className: 'font-semibold' }, 'Results: '),
        React.createElement('span', { className: 'text-blue-600' },
          `${voters.length.toLocaleString()} of ${total.toLocaleString()}`
        )
      ),
      React.createElement('div', { className: 'flex gap-2' },
        selected.size > 0 && React.createElement('button', {
          onClick: () => onCreateList && onCreateList(Array.from(selected)),
          className: 'px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700'
        }, `Create List (${selected.size})`),
        React.createElement('button', {
          onClick: () => {
            // Export to CSV
            const csv = [
              ['NCID', 'First Name', 'Last Name', 'Address', 'City', 'ZIP', 'Party', 'Age', 'Phone'].join(','),
              ...voters.map(v => [
                v.ncid, v.first_name, v.last_name, `"${v.street_address}"`,
                v.city, v.zip_code, v.party, v.age, v.phone
              ].join(','))
            ].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'voters.csv';
            a.click();
          },
          className: 'px-4 py-2 border rounded hover:bg-gray-50'
        }, 'Export CSV')
      )
    ),

    // Table
    React.createElement('div', { className: 'overflow-x-auto' },
      React.createElement('table', { className: 'w-full' },
        React.createElement('thead', { className: 'bg-gray-50' },
          React.createElement('tr', null,
            React.createElement('th', { className: 'p-3 text-left' },
              React.createElement('input', {
                type: 'checkbox',
                checked: selected.size === voters.length && voters.length > 0,
                onChange: toggleSelectAll,
              })
            ),
            React.createElement('th', { className: 'p-3 text-left' }, 'Name'),
            React.createElement('th', { className: 'p-3 text-left' }, 'Address'),
            React.createElement('th', { className: 'p-3 text-left' }, 'Party'),
            React.createElement('th', { className: 'p-3 text-left' }, 'Age'),
            React.createElement('th', { className: 'p-3 text-left' }, 'Turnout'),
            React.createElement('th', { className: 'p-3 text-left' }, 'Phone'),
          )
        ),
        React.createElement('tbody', null,
          voters.map(voter =>
            React.createElement('tr', {
              key: voter.ncid,
              className: `border-t hover:bg-gray-50 ${selected.has(voter.ncid) ? 'bg-blue-50' : ''}`
            },
              React.createElement('td', { className: 'p-3' },
                React.createElement('input', {
                  type: 'checkbox',
                  checked: selected.has(voter.ncid),
                  onChange: () => toggleSelect(voter.ncid),
                })
              ),
              React.createElement('td', { className: 'p-3' },
                React.createElement('div', { className: 'font-medium' },
                  `${voter.first_name} ${voter.last_name}`
                ),
                React.createElement('div', { className: 'text-xs text-gray-500' }, voter.ncid)
              ),
              React.createElement('td', { className: 'p-3' },
                React.createElement('div', null, voter.street_address),
                React.createElement('div', { className: 'text-sm text-gray-500' },
                  `${voter.city}, NC ${voter.zip_code}`
                )
              ),
              React.createElement('td', { className: 'p-3' },
                React.createElement('span', {
                  className: `px-2 py-1 rounded text-sm ${
                    voter.party === 'Democratic' ? 'bg-blue-100 text-blue-800' :
                    voter.party === 'Republican' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`
                }, voter.party || 'UNA')
              ),
              React.createElement('td', { className: 'p-3' }, voter.age || '-'),
              React.createElement('td', { className: 'p-3' },
                voter.turnout_score !== null
                  ? React.createElement('div', { className: 'flex items-center gap-2' },
                      React.createElement('div', {
                        className: 'w-16 h-2 bg-gray-200 rounded-full overflow-hidden'
                      },
                        React.createElement('div', {
                          className: 'h-full bg-green-500',
                          style: { width: `${voter.turnout_score}%` }
                        })
                      ),
                      React.createElement('span', { className: 'text-sm' }, `${voter.turnout_score}%`)
                    )
                  : '-'
              ),
              React.createElement('td', { className: 'p-3 text-sm' }, voter.phone || '-'),
            )
          )
        )
      )
    ),

    // Load more
    voters.length < total && React.createElement('div', { className: 'p-4 border-t text-center' },
      React.createElement('button', {
        onClick: onLoadMore,
        className: 'px-6 py-2 bg-gray-100 rounded hover:bg-gray-200'
      }, 'Load More')
    )
  );
}

// ============================================================================
// Map Component (Leaflet Integration)
// ============================================================================

function VoterMap({ voters, turfs, onTurfDraw, onVoterClick }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    // Initialize map
    if (!mapInstanceRef.current && mapRef.current && window.L) {
      mapInstanceRef.current = L.map(mapRef.current).setView([35.5951, -82.5515], 11); // Asheville, NC

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapInstanceRef.current);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !voters) return;

    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Add voter markers
    const validVoters = voters.filter(v => v.latitude && v.longitude);

    if (validVoters.length > 0) {
      const bounds = L.latLngBounds(validVoters.map(v => [v.latitude, v.longitude]));
      mapInstanceRef.current.fitBounds(bounds, { padding: [20, 20] });

      validVoters.forEach(voter => {
        const color = voter.party === 'Democratic' ? '#3B82F6' :
                      voter.party === 'Republican' ? '#EF4444' : '#6B7280';

        const marker = L.circleMarker([voter.latitude, voter.longitude], {
          radius: 6,
          fillColor: color,
          color: '#fff',
          weight: 1,
          fillOpacity: 0.8,
        }).addTo(mapInstanceRef.current);

        marker.bindPopup(`
          <strong>${voter.first_name} ${voter.last_name}</strong><br>
          ${voter.street_address}<br>
          Party: ${voter.party || 'UNA'}<br>
          Turnout: ${voter.turnout_score || 'N/A'}%
        `);

        if (onVoterClick) {
          marker.on('click', () => onVoterClick(voter));
        }

        markersRef.current.push(marker);
      });
    }
  }, [voters]);

  // Add turf polygons
  useEffect(() => {
    if (!mapInstanceRef.current || !turfs) return;

    turfs.forEach(turf => {
      if (turf.boundary) {
        L.geoJSON(turf.boundary, {
          style: {
            color: '#10B981',
            weight: 2,
            fillOpacity: 0.1,
          }
        }).addTo(mapInstanceRef.current)
          .bindPopup(`<strong>${turf.name}</strong><br>Doors: ${turf.door_count}`);
      }
    });
  }, [turfs]);

  return React.createElement('div', {
    ref: mapRef,
    className: 'w-full h-96 rounded-lg border',
    style: { minHeight: '400px' }
  });
}

// ============================================================================
// List Management Component
// ============================================================================

function ListManager({ onListSelect }) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadLists();
  }, []);

  const loadLists = async () => {
    try {
      const data = await apiCall('/lists');
      setLists(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteList = async (id) => {
    if (!confirm('Delete this list?')) return;
    try {
      await apiCall(`/lists/${id}`, { method: 'DELETE' });
      loadLists();
    } catch (err) {
      alert(err.message);
    }
  };

  const groupByHousehold = async (id) => {
    try {
      const result = await apiCall(`/lists/${id}/household`, { method: 'POST' });
      alert(`Grouped into ${result.households} households`);
      loadLists();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return React.createElement('div', { className: 'p-4' }, 'Loading lists...');

  return React.createElement('div', { className: 'bg-white rounded-lg shadow-lg p-6' },
    React.createElement('h2', { className: 'text-xl font-bold mb-4' }, 'My Lists'),

    error && React.createElement('div', { className: 'mb-4 p-3 bg-red-100 text-red-700 rounded' }, error),

    lists.length === 0
      ? React.createElement('p', { className: 'text-gray-500' }, 'No lists yet. Create one from your query results.')
      : React.createElement('div', { className: 'space-y-3' },
          lists.map(list =>
            React.createElement('div', {
              key: list.id,
              className: 'border rounded-lg p-4 hover:bg-gray-50'
            },
              React.createElement('div', { className: 'flex justify-between items-start' },
                React.createElement('div', null,
                  React.createElement('h3', { className: 'font-semibold' }, list.name),
                  React.createElement('p', { className: 'text-sm text-gray-500' },
                    `${list.voter_count.toLocaleString()} voters • Created ${new Date(list.created_at).toLocaleDateString()}`
                  )
                ),
                React.createElement('div', { className: 'flex gap-2' },
                  React.createElement('button', {
                    onClick: () => onListSelect && onListSelect(list),
                    className: 'text-blue-600 hover:text-blue-800'
                  }, 'View'),
                  React.createElement('button', {
                    onClick: () => groupByHousehold(list.id),
                    className: 'text-green-600 hover:text-green-800'
                  }, 'Group'),
                  React.createElement('button', {
                    onClick: () => window.open(`${API_BASE}/export/csv/list/${list.id}`, '_blank'),
                    className: 'text-gray-600 hover:text-gray-800'
                  }, 'CSV'),
                  React.createElement('button', {
                    onClick: () => window.open(`${API_BASE}/export/pdf/list/${list.id}`, '_blank'),
                    className: 'text-gray-600 hover:text-gray-800'
                  }, 'PDF'),
                  React.createElement('button', {
                    onClick: () => deleteList(list.id),
                    className: 'text-red-600 hover:text-red-800'
                  }, 'Delete'),
                )
              )
            )
          )
        )
  );
}

// ============================================================================
// Turf Cutting Component
// ============================================================================

function TurfCutter({ listId, onTurfCreated }) {
  const [doorsPerTurf, setDoorsPerTurf] = useState(50);
  const [method, setMethod] = useState('cluster');
  const [loading, setLoading] = useState(false);
  const [turfs, setTurfs] = useState([]);

  const autoCut = async () => {
    if (!listId) {
      alert('Please select a list first');
      return;
    }

    setLoading(true);
    try {
      const result = await apiCall('/turfs/auto-cut', {
        method: 'POST',
        body: JSON.stringify({ list_id: listId, doors_per_turf: doorsPerTurf, method }),
      });
      setTurfs(result.turfs);
      if (onTurfCreated) onTurfCreated(result.turfs);
      alert(`Created ${result.turfs_created} turfs`);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return React.createElement('div', { className: 'bg-white rounded-lg shadow-lg p-6' },
    React.createElement('h2', { className: 'text-xl font-bold mb-4' }, 'Turf Cutting'),

    React.createElement('div', { className: 'space-y-4' },
      React.createElement('div', null,
        React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' },
          'Doors per Turf'
        ),
        React.createElement('input', {
          type: 'number',
          value: doorsPerTurf,
          onChange: (e) => setDoorsPerTurf(parseInt(e.target.value)),
          min: 10,
          max: 200,
          className: 'w-full border rounded px-3 py-2',
        })
      ),

      React.createElement('div', null,
        React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' },
          'Cutting Method'
        ),
        React.createElement('select', {
          value: method,
          onChange: (e) => setMethod(e.target.value),
          className: 'w-full border rounded px-3 py-2',
        },
          React.createElement('option', { value: 'cluster' }, 'Cluster (Geographic)'),
          React.createElement('option', { value: 'grid' }, 'Grid'),
          React.createElement('option', { value: 'precinct' }, 'By Precinct'),
        )
      ),

      React.createElement('button', {
        onClick: autoCut,
        disabled: loading || !listId,
        className: 'w-full py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50'
      }, loading ? 'Cutting Turfs...' : 'Auto-Cut Turfs'),
    ),

    turfs.length > 0 && React.createElement('div', { className: 'mt-6' },
      React.createElement('h3', { className: 'font-semibold mb-2' }, 'Created Turfs'),
      React.createElement('div', { className: 'space-y-2' },
        turfs.map(turf =>
          React.createElement('div', {
            key: turf.id,
            className: 'flex justify-between items-center border rounded p-3'
          },
            React.createElement('div', null,
              React.createElement('span', { className: 'font-medium' }, turf.name),
              React.createElement('span', { className: 'text-sm text-gray-500 ml-2' },
                `${turf.door_count} doors • ~${turf.estimated_time_minutes} min`
              )
            ),
            React.createElement('div', { className: 'flex gap-2' },
              React.createElement('button', {
                onClick: () => window.open(`${API_BASE}/export/pdf/turf/${turf.id}`, '_blank'),
                className: 'text-sm text-blue-600'
              }, 'PDF'),
              React.createElement('button', {
                onClick: async () => {
                  const route = await apiCall(`/turfs/${turf.id}/route`);
                  alert(`Optimized route: ${route.route.length} stops, ${route.distance}m`);
                },
                className: 'text-sm text-green-600'
              }, 'Route'),
            )
          )
        )
      )
    )
  );
}

// ============================================================================
// Mobile Voter Lookup Component
// ============================================================================

function MobileVoterLookup() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedVoter, setSelectedVoter] = useState(null);

  const handleSearch = async () => {
    if (!search.trim()) return;

    setLoading(true);
    try {
      const result = await apiCall(`/voters?search=${encodeURIComponent(search)}&limit=20`);
      setResults(result.voters);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadVoterDetails = async (ncid) => {
    try {
      const [voter, history] = await Promise.all([
        apiCall(`/voters/${ncid}`),
        apiCall(`/voters/${ncid}/history`),
      ]);
      setSelectedVoter({ ...voter, history });
    } catch (err) {
      alert(err.message);
    }
  };

  if (selectedVoter) {
    return React.createElement('div', { className: 'bg-white min-h-screen' },
      // Back button
      React.createElement('button', {
        onClick: () => setSelectedVoter(null),
        className: 'p-4 flex items-center gap-2 text-blue-600'
      }, '← Back to Search'),

      // Voter details
      React.createElement('div', { className: 'p-4' },
        React.createElement('h1', { className: 'text-2xl font-bold' },
          `${selectedVoter.first_name} ${selectedVoter.last_name}`
        ),
        React.createElement('p', { className: 'text-gray-500' }, selectedVoter.ncid),

        React.createElement('div', { className: 'mt-4 space-y-2' },
          React.createElement('p', null, React.createElement('strong', null, 'Address: '), selectedVoter.street_address),
          React.createElement('p', null, `${selectedVoter.city}, NC ${selectedVoter.zip_code}`),
          React.createElement('p', null, React.createElement('strong', null, 'Party: '), selectedVoter.party),
          React.createElement('p', null, React.createElement('strong', null, 'Age: '), selectedVoter.age),
          selectedVoter.phone && React.createElement('p', null,
            React.createElement('strong', null, 'Phone: '),
            React.createElement('a', { href: `tel:${selectedVoter.phone}`, className: 'text-blue-600' },
              selectedVoter.phone
            )
          ),
        ),

        // Vote history
        React.createElement('h2', { className: 'text-xl font-bold mt-6 mb-2' }, 'Vote History'),
        selectedVoter.history && selectedVoter.history.length > 0
          ? React.createElement('div', { className: 'space-y-2' },
              selectedVoter.history.slice(0, 10).map((h, i) =>
                React.createElement('div', {
                  key: i,
                  className: 'border rounded p-2'
                },
                  React.createElement('div', { className: 'font-medium' }, h.election_desc),
                  React.createElement('div', { className: 'text-sm text-gray-500' },
                    `${h.election_date} • ${h.voting_method}`
                  )
                )
              )
            )
          : React.createElement('p', { className: 'text-gray-500' }, 'No vote history'),

        // Quick contact buttons
        React.createElement('div', { className: 'mt-6 grid grid-cols-3 gap-2' },
          ['Canvassed', 'Not Home', 'Refused'].map(type =>
            React.createElement('button', {
              key: type,
              onClick: async () => {
                await apiCall(`/voters/${selectedVoter.ncid}/contact`, {
                  method: 'POST',
                  body: JSON.stringify({ contact_type: type }),
                });
                alert('Contact logged!');
              },
              className: 'py-3 bg-gray-100 rounded font-medium hover:bg-gray-200'
            }, type)
          )
        )
      )
    );
  }

  return React.createElement('div', { className: 'bg-white min-h-screen' },
    // Search header
    React.createElement('div', { className: 'p-4 bg-blue-600' },
      React.createElement('h1', { className: 'text-white text-xl font-bold mb-2' }, 'Voter Lookup'),
      React.createElement('div', { className: 'flex gap-2' },
        React.createElement('input', {
          type: 'text',
          value: search,
          onChange: (e) => setSearch(e.target.value),
          onKeyPress: (e) => e.key === 'Enter' && handleSearch(),
          placeholder: 'Search name or address...',
          className: 'flex-1 px-4 py-2 rounded',
        }),
        React.createElement('button', {
          onClick: handleSearch,
          disabled: loading,
          className: 'px-4 py-2 bg-white text-blue-600 rounded font-medium'
        }, loading ? '...' : 'Search')
      )
    ),

    // Results
    React.createElement('div', { className: 'p-4' },
      results.length === 0
        ? React.createElement('p', { className: 'text-gray-500 text-center mt-8' },
            'Search for a voter by name or address'
          )
        : React.createElement('div', { className: 'space-y-2' },
            results.map(voter =>
              React.createElement('div', {
                key: voter.ncid,
                onClick: () => loadVoterDetails(voter.ncid),
                className: 'border rounded p-3 cursor-pointer hover:bg-gray-50'
              },
                React.createElement('div', { className: 'font-medium' },
                  `${voter.first_name} ${voter.last_name}`
                ),
                React.createElement('div', { className: 'text-sm text-gray-500' },
                  voter.street_address
                ),
                React.createElement('div', { className: 'flex gap-2 mt-1' },
                  React.createElement('span', {
                    className: `text-xs px-2 py-1 rounded ${
                      voter.party === 'Democratic' ? 'bg-blue-100 text-blue-800' :
                      voter.party === 'Republican' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100'
                    }`
                  }, voter.party || 'UNA'),
                  voter.age && React.createElement('span', {
                    className: 'text-xs px-2 py-1 bg-gray-100 rounded'
                  }, `Age ${voter.age}`)
                )
              )
            )
          )
    )
  );
}

// ============================================================================
// Main App Component
// ============================================================================

function VoterQueryApp() {
  const [view, setView] = useState('query'); // 'query', 'lists', 'map', 'mobile'
  const [queryResults, setQueryResults] = useState(null);
  const [selectedList, setSelectedList] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSearch = (results) => {
    setQueryResults(results);
  };

  const handleCreateList = async (ncids) => {
    const name = prompt('Enter a name for this list:');
    if (!name) return;

    try {
      await apiCall('/lists', {
        method: 'POST',
        body: JSON.stringify({
          name,
          query_config: {}, // Would need to pass actual config
        }),
      });
      alert('List created!');
      setView('lists');
    } catch (err) {
      alert(err.message);
    }
  };

  // Mobile view
  if (isMobile) {
    return React.createElement(MobileVoterLookup);
  }

  return React.createElement('div', { className: 'min-h-screen bg-gray-100' },
    // Navigation
    React.createElement('nav', { className: 'bg-blue-600 text-white' },
      React.createElement('div', { className: 'max-w-7xl mx-auto px-4' },
        React.createElement('div', { className: 'flex items-center justify-between h-16' },
          React.createElement('h1', { className: 'text-xl font-bold' }, 'CivicVoice Query Builder'),
          React.createElement('div', { className: 'flex gap-4' },
            ['query', 'lists', 'map'].map(v =>
              React.createElement('button', {
                key: v,
                onClick: () => setView(v),
                className: `px-4 py-2 rounded ${view === v ? 'bg-blue-700' : 'hover:bg-blue-500'}`
              }, v.charAt(0).toUpperCase() + v.slice(1))
            )
          )
        )
      )
    ),

    // Main content
    React.createElement('main', { className: 'max-w-7xl mx-auto p-6' },
      view === 'query' && React.createElement('div', { className: 'grid grid-cols-1 lg:grid-cols-2 gap-6' },
        React.createElement(QueryBuilder, {
          onSearch: handleSearch,
        }),
        queryResults && React.createElement(VoterResultsTable, {
          voters: queryResults.voters,
          total: queryResults.total,
          onCreateList: handleCreateList,
        })
      ),

      view === 'lists' && React.createElement('div', { className: 'grid grid-cols-1 lg:grid-cols-2 gap-6' },
        React.createElement(ListManager, {
          onListSelect: setSelectedList,
        }),
        selectedList && React.createElement(TurfCutter, {
          listId: selectedList.id,
        })
      ),

      view === 'map' && React.createElement('div', { className: 'space-y-6' },
        React.createElement(VoterMap, {
          voters: queryResults?.voters || [],
        })
      )
    )
  );
}

// Export for use
window.VoterQueryApp = VoterQueryApp;
window.QueryBuilder = QueryBuilder;
window.VoterResultsTable = VoterResultsTable;
window.VoterMap = VoterMap;
window.ListManager = ListManager;
window.TurfCutter = TurfCutter;
window.MobileVoterLookup = MobileVoterLookup;
