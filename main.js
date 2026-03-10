const fs = require("fs");

// ============================================================
// HELPER FUNCTIONS (for time conversion)
// ============================================================


function timeToSeconds(timeStr) {
    // Trim any extra spaces
    timeStr = timeStr.trim();
    
    // Split into time and period (am/pm)
    const parts = timeStr.split(' ');
    const timePart = parts[0]; // "6:01:20"
    const period = parts[1]?.toLowerCase(); // "am" or "pm"
    
    // Split time into hours, minutes, seconds
    const timeComponents = timePart.split(':');
    let hours = parseInt(timeComponents[0], 10);
    const minutes = parseInt(timeComponents[1], 10);
    const seconds = parseInt(timeComponents[2], 10);
    
    // Convert to 24-hour format
    if (period === 'pm' && hours !== 12) {
        hours += 12;
    } else if (period === 'am' && hours === 12) {
        hours = 0;
    }
    
    return (hours * 3600) + (minutes * 60) + seconds;
}


function durationToSeconds(durationStr) {
    durationStr = durationStr.trim();
    const parts = durationStr.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    
    return (hours * 3600) + (minutes * 60) + seconds;
}


function secondsToTime(totalSeconds, tripleDigitHours = false) {
    // Handle negative values in case
    totalSeconds = Math.max(0, totalSeconds);
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    // Format with leading zeros for minutes and seconds
    const minutesStr = minutes.toString().padStart(2, '0');
    const secondsStr = seconds.toString().padStart(2, '0');
    
    if (tripleDigitHours) {
        // For hhh:mm:ss format (3-digit hours with leading zeros if needed)
        const hoursStr = hours.toString().padStart(3, '0');
        return `${hoursStr}:${minutesStr}:${secondsStr}`;
    } else {
        // For h:mm:ss format (no leading zero for hours)
        return `${hours}:${minutesStr}:${secondsStr}`;
    }
}


function parseCSVLine(line, headers) {
    const values = line.split(',');
    const obj = {};
    headers.forEach((header, index) => {
        // Trim whitespace and handle boolean conversion
        let value = values[index] ? values[index].trim() : '';
        if (header === 'metQuota' || header === 'hasBonus') {
            obj[header] = value === 'true';
        } else {
            obj[header] = value;
        }
    });
    return obj;
}


function objectToCSVLine(obj, headers) {
    return headers.map(header => {
        let value = obj[header];
        // Convert booleans to strings
        if (typeof value === 'boolean') {
            return value.toString();
        }
        return value;
    }).join(',');
}
// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// Calculates time difference between start and end times
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {
   // Edge cases:
    // - Handle times that cross noon/midnight
    // - Handle invalid inputs
    
    // Convert both times to seconds since midnight
    const startSeconds = timeToSeconds(startTime);
    let endSeconds = timeToSeconds(endTime);
    
    // If end time is less than start time, assume it's next day
    // (e.g., 10:00 pm to 2:00 am next day)
    if (endSeconds < startSeconds) {
        endSeconds += 24 * 3600; // Add 24 hours
    }
    
    // Calculate difference
    const diffSeconds = endSeconds - startSeconds;
    
    // Convert back to h:mm:ss format
    return secondsToTime(diffSeconds);
}


// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// Calculates idle time outside delivery hours (8am-10pm)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    // Edge cases:
    // - Shift completely outside delivery hours
    // - Shift partially overlapping
    // - Shift entirely within delivery hours
    
    // Convert times to seconds since midnight
    const startSeconds = timeToSeconds(startTime);
    let endSeconds = timeToSeconds(endTime);
    
    // Handle next day if needed
    if (endSeconds < startSeconds) {
        endSeconds += 24 * 3600;
    }
    
    // Define delivery hours boundaries
    const deliveryStart = 8 * 3600; // 8:00:00 am in seconds
    const deliveryEnd = 22 * 3600;   // 10:00:00 pm in seconds
    
    let idleSeconds = 0;
    
    // Calculate idle time before delivery hours
    if (startSeconds < deliveryStart) {
        const idleBeforeEnd = Math.min(endSeconds, deliveryStart);
        idleSeconds += (idleBeforeEnd - startSeconds);
    }
    
    // Calculate idle time after delivery hours
    if (endSeconds > deliveryEnd) {
        const idleAfterStart = Math.max(startSeconds, deliveryEnd);
        idleSeconds += (endSeconds - idleAfterStart);
    }
    
    return secondsToTime(idleSeconds);
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// Calculates active time = shiftDuration - idleTime
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
     // Edge cases:
    // - idleTime greater than shiftDuration (shouldn't happen but handle)
    
    const shiftSeconds = durationToSeconds(shiftDuration);
    const idleSeconds = durationToSeconds(idleTime);
    
    // Active time cannot be negative
    const activeSeconds = Math.max(0, shiftSeconds - idleSeconds);
    
    return secondsToTime(activeSeconds);
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// Checks if driver met daily quota (8h24m normal, 6h during Eid)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// ============================================================
function metQuota(date, activeTime) {
     // Edge cases:
    // - Invalid date format
    // - Date exactly on boundaries
    
    // Parse the date
    const dateObj = new Date(date);
    
    // Define Eid period (April 10-30, 2025)
    const eidStart = new Date('2025-04-10');
    const eidEnd = new Date('2025-04-30');
    
    // Check if date is within Eid period
    const isEidPeriod = dateObj >= eidStart && dateObj <= eidEnd;
    
    // Set quota based on period
    const quotaSeconds = isEidPeriod ? 6 * 3600 : (8 * 3600) + (24 * 60);
    
    // Convert activeTime to seconds
    const activeSeconds = durationToSeconds(activeTime);
    
    // Return true if active time meets or exceeds quota
    return activeSeconds >= quotaSeconds;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// Adds a new shift record to the file with all calculated fields
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    // Edge cases:
    // - Empty file
    // - Duplicate driverID + date
    // - First record for a driver
    // - File doesn't exist (should exist in assignment)
    
    try {
        // Read the file
        let content = fs.readFileSync(textFile, 'utf8');
        const lines = content.trim().split('\n');
        
        // Handle empty file (just headers)
        if (lines.length === 0) {
            return {};
        }
        
        // Get headers from first line
        const headers = lines[0].split(',');
        
        // Check for duplicate (same driverID and date)
        let duplicateFound = false;
        let lastIndexForDriver = -1;
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            
            const record = parseCSVLine(lines[i], headers);
            
            // Track last occurrence of this driver
            if (record.driverID === shiftObj.driverID) {
                lastIndexForDriver = i;
                
                // Check if same date (duplicate)
                if (record.date === shiftObj.date) {
                    duplicateFound = true;
                }
            }
        }
        
        // If duplicate found, return empty object
        if (duplicateFound) {
            return {};
        }
        
        // Calculate all required fields
        const shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
        const idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
        const activeTime = getActiveTime(shiftDuration, idleTime);
        const metQuotaValue = metQuota(shiftObj.date, activeTime);
        
        // Create complete record with all 10 properties
        const newRecord = {
            driverID: shiftObj.driverID,
            driverName: shiftObj.driverName,
            date: shiftObj.date,
            startTime: shiftObj.startTime,
            endTime: shiftObj.endTime,
            shiftDuration: shiftDuration,
            idleTime: idleTime,
            activeTime: activeTime,
            metQuota: metQuotaValue,
            hasBonus: false
        };
        
        // Convert new record to CSV line
        const newLine = objectToCSVLine(newRecord, headers);
        
        // Insert at appropriate position
        if (lastIndexForDriver === -1) {
            // New driver - append to end
            lines.push(newLine);
        } else {
            // Existing driver - insert after last occurrence
            lines.splice(lastIndexForDriver + 1, 0, newLine);
        }
        
        // Write back to file
        const updatedContent = lines.join('\n');
        fs.writeFileSync(textFile, updatedContent);
        
        return newRecord;
        
    } catch (error) {
        // If any error occurs, return empty object
        console.error("Error in addShiftRecord:", error);
        return {};
    }
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// Updates the hasBonus field for a specific record
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
   // Edge cases:
    // - Record not found (do nothing)
    // - Multiple records same driver/date (shouldn't happen)
    
    try {
        // Read the file
        let content = fs.readFileSync(textFile, 'utf8');
        const lines = content.trim().split('\n');
        
        if (lines.length === 0) return;
        
        // Get headers
        const headers = lines[0].split(',');
        
        // Find the bonus column index
        const bonusIndex = headers.findIndex(h => h === 'hasBonus');
        
        // Find and update the matching record
        let updated = false;
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            
            const values = lines[i].split(',');
            
            // Check if this is the record we want
            if (values[0].trim() === driverID && values[2].trim() === date) {
                // Update the bonus value
                values[bonusIndex] = newValue.toString();
                lines[i] = values.join(',');
                updated = true;
                break; // Found and updated, no need to continue
            }
        }
        
        // If updated, write back to file
        if (updated) {
            const updatedContent = lines.join('\n');
            fs.writeFileSync(textFile, updatedContent);
        }
        
    } catch (error) {
        console.error("Error in setBonus:", error);
    }
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    // TODO: Implement this function
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    // TODO: Implement this function
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    // TODO: Implement this function
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    // TODO: Implement this function
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
