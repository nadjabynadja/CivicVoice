/**
 * NC State Board of Elections Data Parser
 * Handles parsing of voter registration files and vote history files
 *
 * File formats:
 * - ncvoter_Statewide.zip: Tab-delimited voter registration data
 * - ncvhis_Statewide.zip: Tab-delimited vote history data
 *
 * Documentation: https://www.ncsbe.gov/results-data/voter-registration-data
 */

import fs from 'fs';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import unzipper from 'unzipper';
import csv from 'csv-parser';

// NC SBE Voter Registration file column mappings
// Based on official NCSBE data layout documentation
export const VOTER_COLUMNS = {
  county_id: 'county_id',
  county_desc: 'county_name',
  voter_reg_num: 'ncid',
  ncid: 'ncid',
  status_cd: 'registration_status',
  voter_status_desc: 'voter_status_reason',
  reason_cd: 'status_reason_code',
  voter_status_reason_desc: 'voter_status_reason',
  absent_ind: 'absent_ind',
  name_prefix_cd: 'name_prefix',
  last_name: 'last_name',
  first_name: 'first_name',
  middle_name: 'middle_name',
  name_suffix_lbl: 'name_suffix',
  res_street_address: 'street_address',
  res_city_desc: 'city',
  state_cd: 'state',
  zip_code: 'zip_code',
  mail_addr1: 'mailing_address',
  mail_addr2: 'mailing_address_2',
  mail_addr3: 'mailing_address_3',
  mail_addr4: 'mailing_address_4',
  mail_city: 'mailing_city',
  mail_state: 'mailing_state',
  mail_zipcode: 'mailing_zip',
  full_phone_number: 'phone',
  confidential_ind: 'confidential_ind',
  registr_dt: 'registration_date',
  race_code: 'race_code',
  ethnic_code: 'ethnicity_code',
  party_cd: 'party',
  gender_code: 'sex',
  birth_year: 'birth_year',
  age_at_year_end: 'age',
  birth_state: 'birth_state',
  drivers_lic: 'drivers_license',
  precinct_abbrv: 'precinct_code',
  precinct_desc: 'precinct_name',
  municipality_abbrv: 'municipality_code',
  municipality_desc: 'municipality',
  ward_abbrv: 'ward_code',
  ward_desc: 'ward',
  cong_dist_abbrv: 'congressional_district',
  super_court_abbrv: 'superior_court',
  judic_dist_abbrv: 'judicial_district',
  nc_senate_abbrv: 'nc_senate_district',
  nc_house_abbrv: 'nc_house_district',
  county_commiss_abbrv: 'county_commission',
  county_commiss_desc: 'county_commission_desc',
  township_abbrv: 'township_code',
  township_desc: 'township',
  school_dist_abbrv: 'school_district_code',
  school_dist_desc: 'school_district',
  fire_dist_abbrv: 'fire_district_code',
  fire_dist_desc: 'fire_district',
  water_dist_abbrv: 'water_district_code',
  water_dist_desc: 'water_district',
  sewer_dist_abbrv: 'sewer_district_code',
  sewer_dist_desc: 'sewer_district',
  sanit_dist_abbrv: 'sanitation_district_code',
  sanit_dist_desc: 'sanitation_district',
  rescue_dist_abbrv: 'rescue_district_code',
  rescue_dist_desc: 'rescue_district',
  munic_dist_abbrv: 'municipal_district_code',
  munic_dist_desc: 'municipal_district',
  dist_1_abbrv: 'district_1_code',
  dist_1_desc: 'district_1',
  vtd_abbrv: 'vtd_code',
  vtd_desc: 'vtd',
};

// NC SBE Vote History file column mappings
export const HISTORY_COLUMNS = {
  county_id: 'county_id',
  county_desc: 'county_name',
  voter_reg_num: 'ncid',
  ncid: 'ncid',
  election_lbl: 'election_desc',
  election_desc: 'election_desc',
  election_date: 'election_date',
  voting_method: 'voting_method',
  voted_party_cd: 'party_voted',
  voted_party_desc: 'party_voted_desc',
  pct_label: 'precinct',
  pct_description: 'precinct_desc',
  ncid: 'ncid',
  voted_county_id: 'voted_county_id',
  voted_county_desc: 'voted_county',
  vtd_label: 'vtd',
  vtd_description: 'vtd_desc',
};

// Race code mappings
export const RACE_CODES = {
  'A': 'Asian',
  'B': 'Black/African American',
  'I': 'American Indian/Alaska Native',
  'M': 'Two or More Races',
  'O': 'Other',
  'U': 'Undesignated',
  'W': 'White',
  'P': 'Native Hawaiian/Pacific Islander',
};

// Ethnicity code mappings
export const ETHNICITY_CODES = {
  'HL': 'Hispanic/Latino',
  'NL': 'Not Hispanic/Latino',
  'UN': 'Undesignated',
};

// Party code mappings
export const PARTY_CODES = {
  'DEM': 'Democratic',
  'REP': 'Republican',
  'UNA': 'Unaffiliated',
  'LIB': 'Libertarian',
  'GRE': 'Green',
  'CST': 'Constitution',
};

// Sex code mappings
export const SEX_CODES = {
  'F': 'Female',
  'M': 'Male',
  'U': 'Unknown',
};

/**
 * Parse a voter registration record from raw data
 */
export function parseVoterRecord(rawRecord) {
  const currentYear = new Date().getFullYear();

  const voter = {
    ncid: rawRecord.ncid || rawRecord.voter_reg_num,
    first_name: cleanString(rawRecord.first_name),
    middle_name: cleanString(rawRecord.middle_name),
    last_name: cleanString(rawRecord.last_name),
    name_suffix: cleanString(rawRecord.name_suffix_lbl),

    street_address: cleanString(rawRecord.res_street_address),
    city: cleanString(rawRecord.res_city_desc),
    state: rawRecord.state_cd || 'NC',
    zip_code: cleanZip(rawRecord.zip_code),

    mailing_address: buildMailingAddress(rawRecord),
    mailing_city: cleanString(rawRecord.mail_city),
    mailing_state: rawRecord.mail_state,
    mailing_zip: cleanZip(rawRecord.mail_zipcode),

    county_name: cleanString(rawRecord.county_desc),
    precinct_name: cleanString(rawRecord.precinct_desc),
    precinct_code: rawRecord.precinct_abbrv,

    congressional_district: rawRecord.cong_dist_abbrv,
    nc_senate_district: rawRecord.nc_senate_abbrv,
    nc_house_district: rawRecord.nc_house_abbrv,
    municipality: cleanString(rawRecord.municipality_desc),
    ward: cleanString(rawRecord.ward_desc),
    school_district: cleanString(rawRecord.school_dist_desc),

    birth_year: parseYear(rawRecord.birth_year),
    age: rawRecord.age_at_year_end
      ? parseInt(rawRecord.age_at_year_end)
      : (rawRecord.birth_year ? currentYear - parseInt(rawRecord.birth_year) : null),
    sex: SEX_CODES[rawRecord.gender_code] || rawRecord.gender_code,
    race: RACE_CODES[rawRecord.race_code] || rawRecord.race_code,
    ethnicity: ETHNICITY_CODES[rawRecord.ethnic_code] || rawRecord.ethnic_code,

    party: PARTY_CODES[rawRecord.party_cd] || rawRecord.party_cd || 'UNA',
    registration_date: parseDate(rawRecord.registr_dt),
    registration_status: rawRecord.status_cd || 'ACTIVE',
    voter_status_reason: cleanString(rawRecord.voter_status_reason_desc),

    phone: cleanPhone(rawRecord.full_phone_number),
    confidential_ind: rawRecord.confidential_ind === 'Y',

    raw_data: rawRecord,
  };

  return voter;
}

/**
 * Parse a vote history record from raw data
 */
export function parseHistoryRecord(rawRecord) {
  return {
    ncid: rawRecord.ncid || rawRecord.voter_reg_num,
    election_date: parseDate(rawRecord.election_date),
    election_type: determineElectionType(rawRecord.election_lbl || rawRecord.election_desc),
    election_desc: cleanString(rawRecord.election_lbl || rawRecord.election_desc),
    voting_method: normalizeVotingMethod(rawRecord.voting_method),
    party_voted: rawRecord.voted_party_cd,
  };
}

/**
 * Determine election type from election description
 */
function determineElectionType(desc) {
  if (!desc) return 'UNKNOWN';
  const upper = desc.toUpperCase();

  if (upper.includes('PRIMARY')) return 'PRIMARY';
  if (upper.includes('GENERAL')) return 'GENERAL';
  if (upper.includes('MUNICIPAL')) return 'MUNICIPAL';
  if (upper.includes('SPECIAL')) return 'SPECIAL';
  if (upper.includes('RUNOFF')) return 'RUNOFF';
  if (upper.includes('SECOND')) return 'RUNOFF';

  return 'OTHER';
}

/**
 * Normalize voting method to standard values
 */
function normalizeVotingMethod(method) {
  if (!method) return 'UNKNOWN';
  const upper = method.toUpperCase();

  if (upper.includes('ABSENTEE') || upper.includes('MAIL')) return 'ABSENTEE';
  if (upper.includes('EARLY') || upper.includes('ONE-STOP')) return 'EARLY';
  if (upper.includes('ELECTION DAY') || upper.includes('POLLING')) return 'ELECTION_DAY';
  if (upper.includes('PROVISIONAL')) return 'PROVISIONAL';
  if (upper.includes('CURBSIDE')) return 'CURBSIDE';
  if (upper.includes('TRANSFER')) return 'TRANSFER';

  return method;
}

/**
 * Clean and normalize string values
 */
function cleanString(str) {
  if (!str) return null;
  return str.trim().replace(/\s+/g, ' ');
}

/**
 * Clean and normalize ZIP codes
 */
function cleanZip(zip) {
  if (!zip) return null;
  const cleaned = zip.replace(/[^0-9-]/g, '');
  return cleaned.length >= 5 ? cleaned : null;
}

/**
 * Clean and normalize phone numbers
 */
function cleanPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1,4)}-${digits.slice(4,7)}-${digits.slice(7)}`;
  }
  return digits.length >= 7 ? digits : null;
}

/**
 * Parse date from various formats
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Try MM/DD/YYYY format
  const mmddyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    return `${mmddyyyy[3]}-${mmddyyyy[1].padStart(2, '0')}-${mmddyyyy[2].padStart(2, '0')}`;
  }

  // Try YYYY-MM-DD format
  const yyyymmdd = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmdd) {
    return dateStr;
  }

  // Try YYYYMMDD format
  const compact = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }

  return null;
}

/**
 * Parse birth year
 */
function parseYear(yearStr) {
  if (!yearStr) return null;
  const year = parseInt(yearStr);
  if (year >= 1900 && year <= new Date().getFullYear()) {
    return year;
  }
  return null;
}

/**
 * Build mailing address from multiple fields
 */
function buildMailingAddress(record) {
  const parts = [
    record.mail_addr1,
    record.mail_addr2,
    record.mail_addr3,
    record.mail_addr4,
  ].filter(p => p && p.trim());

  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Stream parser for large NC SBE files
 * Uses streaming to handle files with millions of records
 */
export class NCSBEStreamParser {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 5000;
    this.onBatch = options.onBatch || (() => {});
    this.onProgress = options.onProgress || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onError = options.onError || ((err) => console.error(err));

    this.recordCount = 0;
    this.batchCount = 0;
    this.currentBatch = [];
    this.errors = [];
  }

  /**
   * Parse a voter file stream
   */
  async parseVoterStream(stream, countyFilter = null) {
    return new Promise((resolve, reject) => {
      this.recordCount = 0;
      this.currentBatch = [];

      stream
        .pipe(csv({
          separator: '\t',
          skipLines: 0,
          headers: true,
          mapHeaders: ({ header }) => header.toLowerCase().trim(),
        }))
        .on('data', (row) => {
          try {
            // Apply county filter if specified
            if (countyFilter && row.county_desc !== countyFilter) {
              return;
            }

            const voter = parseVoterRecord(row);
            if (voter.ncid) {
              this.currentBatch.push(voter);
              this.recordCount++;

              if (this.currentBatch.length >= this.batchSize) {
                this.flushBatch();
              }

              if (this.recordCount % 10000 === 0) {
                this.onProgress({
                  processed: this.recordCount,
                  batches: this.batchCount,
                });
              }
            }
          } catch (err) {
            this.errors.push({ row, error: err.message });
          }
        })
        .on('end', async () => {
          // Flush remaining records
          if (this.currentBatch.length > 0) {
            await this.flushBatch();
          }

          const result = {
            totalRecords: this.recordCount,
            totalBatches: this.batchCount,
            errors: this.errors.length,
          };

          this.onComplete(result);
          resolve(result);
        })
        .on('error', (err) => {
          this.onError(err);
          reject(err);
        });
    });
  }

  /**
   * Parse a vote history file stream
   */
  async parseHistoryStream(stream, ncidFilter = null) {
    return new Promise((resolve, reject) => {
      this.recordCount = 0;
      this.currentBatch = [];

      stream
        .pipe(csv({
          separator: '\t',
          skipLines: 0,
          headers: true,
          mapHeaders: ({ header }) => header.toLowerCase().trim(),
        }))
        .on('data', (row) => {
          try {
            // Apply NCID filter if specified (e.g., from a Set of NCIDs)
            if (ncidFilter && !ncidFilter.has(row.ncid || row.voter_reg_num)) {
              return;
            }

            const history = parseHistoryRecord(row);
            if (history.ncid && history.election_date) {
              this.currentBatch.push(history);
              this.recordCount++;

              if (this.currentBatch.length >= this.batchSize) {
                this.flushBatch();
              }

              if (this.recordCount % 50000 === 0) {
                this.onProgress({
                  processed: this.recordCount,
                  batches: this.batchCount,
                });
              }
            }
          } catch (err) {
            this.errors.push({ row, error: err.message });
          }
        })
        .on('end', async () => {
          if (this.currentBatch.length > 0) {
            await this.flushBatch();
          }

          const result = {
            totalRecords: this.recordCount,
            totalBatches: this.batchCount,
            errors: this.errors.length,
          };

          this.onComplete(result);
          resolve(result);
        })
        .on('error', (err) => {
          this.onError(err);
          reject(err);
        });
    });
  }

  async flushBatch() {
    const batch = this.currentBatch;
    this.currentBatch = [];
    this.batchCount++;

    try {
      await this.onBatch(batch, this.batchCount);
    } catch (err) {
      this.onError(err);
    }
  }
}

/**
 * Extract ZIP file and return paths to extracted files
 */
export async function extractZip(zipPath, extractDir) {
  const extractedFiles = [];

  await fs.promises.mkdir(extractDir, { recursive: true });

  const directory = await unzipper.Open.file(zipPath);

  for (const file of directory.files) {
    if (file.type === 'File' && !file.path.startsWith('__MACOSX')) {
      const outputPath = path.join(extractDir, path.basename(file.path));
      await pipeline(
        file.stream(),
        createWriteStream(outputPath)
      );
      extractedFiles.push({
        name: path.basename(file.path),
        path: outputPath,
        size: file.uncompressedSize,
      });
    }
  }

  return extractedFiles;
}

export default {
  parseVoterRecord,
  parseHistoryRecord,
  NCSBEStreamParser,
  extractZip,
  VOTER_COLUMNS,
  HISTORY_COLUMNS,
  RACE_CODES,
  ETHNICITY_CODES,
  PARTY_CODES,
  SEX_CODES,
};
