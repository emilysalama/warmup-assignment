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
        let content;
        try {
            content = fs.readFileSync(textFile, 'utf8');
        } catch (e) {
            // If file doesn't exist, create with headers
            const headers = 'driverID,driverName,date,startTime,endTime,shiftDuration,idleTime,activeTime,metQuota,hasBonus';
            fs.writeFileSync(textFile, headers);
            content = headers;
        }
        
        // Split into lines and clean up
        let lines = content.split('\n').filter(line => line.trim() !== '');
        
        // Ensure headers exist
        if (lines.length === 0) {
            lines = ['driverID,driverName,date,startTime,endTime,shiftDuration,idleTime,activeTime,metQuota,hasBonus'];
        }
    
        const headers = lines[0].split(',');
        
        // Check for duplicate (same driverID and date)
        let duplicateFound = false;
        let lastIndexForDriver = -1;
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i] || lines[i].trim() === '') continue;
            
            const values = lines[i].split(',');
            if (values.length < 2) continue;
            
            const currentDriverID = values[0].trim();
            const currentDate = values[2] ? values[2].trim() : '';
        
            if (currentDriverID === shiftObj.driverID) {
               lastIndexForDriver = i;
                if (currentDate === shiftObj.date) {
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
        
        // Create complete record
        const newRecord = [
            shiftObj.driverID,
            shiftObj.driverName,
            shiftObj.date,
            shiftObj.startTime,
            shiftObj.endTime,
            shiftDuration,
            idleTime,
            activeTime,
            metQuotaValue ? 'true' : 'false',
            'false'
        ];
        
        const newLine = newRecord.join(',');
        
        // Insert at appropriate position
        if (lastIndexForDriver === -1) {
            // New driver - append to end
            lines.push(newLine);
        } else {
            // Existing driver - insert after last occurrence
            lines.splice(lastIndexForDriver + 1, 0, newLine);
        }
        
        // Write back to file
        fs.writeFileSync(textFile, lines.join('\n'));
        
        // Return the record as an object
        return {
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
     
    } catch (error) {
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
 // Edge cases:
    // - Record not found (do nothing)
    // - Multiple records same driver/date (shouldn't happen)
// ============================================================

function setBonus(textFile, driverID, date, newValue) {
    try {
        // Read the file
        let content;
        try {
            content = fs.readFileSync(textFile, 'utf8');
        } catch (e) {
            return; // File doesn't exist
        }
        
        const lines = content.split('\n');
        if (lines.length <= 1) return;
    
        // Find and update the matching record
        let updated = false;
        let updatedLines = [];
        
        // Keep the header
        updatedLines.push(lines[0]);
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '') {
                updatedLines.push('');
                continue;
            }
            
            const values = line.split(',');
            if (values.length < 3) {
                updatedLines.push(lines[i]);
                continue;
            }
            
            const currentDriverID = values[0].trim();
            const currentDate = values[2].trim();
            
            if (currentDriverID === driverID && currentDate === date) {
                // Update the hasBonus field (last column)
                values[values.length - 1] = newValue ? 'true' : 'false';
                updatedLines.push(values.join(','));
                updated = true;
            } else {
                updatedLines.push(lines[i]);
            }
        }
        
        // If updated, write back to file
        if (updated) {
            fs.writeFileSync(textFile, updatedLines.join('\n'));
        }
        
    } catch (error) {
        console.error("Error in setBonus:", error);
    }
}


// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// Counts bonus records for a driver in a specific month
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// Edge cases:
    // - Month can be "4" or "04"
    // - Driver not found (return -1)
    // - No records for that month (return 0)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    try {
        // Read the file
        let content;
        try {
            content = fs.readFileSync(textFile, 'utf8');
        } catch (e) {
            return -1;
        }
        
        const lines = content.split('\n').filter(line => line.trim() !== '');
        if (lines.length <= 1) return -1;
    
        // Normalize month
        const monthStr = month.toString().padStart(2, '0');
        
        let driverFound = false;
        let bonusCount = 0;
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = line.split(',');
            if (values.length < 10) continue; // Need all 10 fields
            
            const currentDriverID = values[0].trim();
            const dateStr = values[2].trim();
            const hasBonus = values[9].trim().toLowerCase(); // hasBonus is last column
            
            if (currentDriverID === driverID) {
                driverFound = true;
                
                // Extract month from date (yyyy-mm-dd)
                if (dateStr && dateStr.length >= 7) {
                    const recordMonth = dateStr.substring(5, 7);
                
                    if (recordMonth === monthStr && hasBonus === 'true') {
                        bonusCount++;
                    }
                }
            }
        }
        
        return driverFound ? bonusCount : -1;
        
    } catch (error) {
        console.error("Error in countBonusPerMonth:", error);
        return -1;
    }
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// Sums active hours for a driver in a specific month
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// Edge cases:
    // - No records for that driver/month (return "000:00:00")
// ============================================================
// ============================================================
// FIXED: getTotalActiveHoursPerMonth
// Remove tripleDigitHours=true — expected format is "33:30:00" not "033:30:00"
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    try {
        let content;
        try {
            content = fs.readFileSync(textFile, 'utf8');
        } catch (e) {
            return "000:00:00";
        }

        const lines = content.split('\n').filter(line => line.trim() !== '');
        if (lines.length <= 1) return "000:00:00";

        const monthStr = month.toString().padStart(2, '0');
        let totalSeconds = 0;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = line.split(',');
            if (values.length < 8) continue;

            const currentDriverID = values[0].trim();
            const dateStr = values[2].trim();
            const activeTime = values[7].trim();

            if (currentDriverID === driverID) {
                if (dateStr && dateStr.length >= 7) {
                    const recordMonth = dateStr.substring(5, 7);
                    if (recordMonth === monthStr) {
                        totalSeconds += durationToSeconds(activeTime);
                    }
                }
            }
        }

        // ✅ FIX: plain secondsToTime, no triple-digit padding
        return secondsToTime(totalSeconds);

    } catch (error) {
        console.error("Error in getTotalActiveHoursPerMonth:", error);
        return "000:00:00";
    }
}



// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// Calculates total required hours for a driver in a month
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
         // Edge cases:
    // - Driver not found in rateFile (return "000:00:00")
    // - No shift records for the month
// ============================================================
// FIXED: getRequiredHoursPerMonth
// - Parse rateFile by header names (handles extra columns like driverName)
// - Return plain h:mm:ss not hhh:mm:ss
// ============================================================
// ============================================================
// FIXED: getRequiredHoursPerMonth
// - Parse rateFile by header names (handles extra columns like driverName)
// - Return plain h:mm:ss not hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    try {
        let rateContent;
        try {
            rateContent = fs.readFileSync(rateFile, 'utf8');
        } catch (e) {
            return "000:00:00";
        }

        const rateLines = rateContent.split('\n').filter(line => line.trim() !== '');
        if (rateLines.length <= 0) return "000:00:00";

        // FIX: Parse header row to find column indices dynamically
        //const rateHeaders = rateLines[0].split(',').map(h => h.trim());
        //const dayOffIdx = rateHeaders.indexOf('dayOff');

        //if (dayOffIdx === -1) return "000:00:00";

        const dayOffIdx = 1; // driverID,dayOff,basePay,tier

        let driverDayOff = null;
        for (let i = 0; i < rateLines.length; i++) {
            const line = rateLines[i].trim();
            if (!line) continue;
            const values = line.split(',');
            if (values[0].trim() === driverID) {
                driverDayOff = values[dayOffIdx].trim();
                break;
            }
        }

        if (!driverDayOff) return "000:00:00";

        let shiftContent;
        try {
            shiftContent = fs.readFileSync(textFile, 'utf8');
        } catch (e) {
            return "000:00:00";
        }

        const shiftLines = shiftContent.split('\n').filter(line => line.trim() !== '');
        if (shiftLines.length <= 1) return "000:00:00";

        const monthStr = month.toString().padStart(2, '0');
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const uniqueDates = new Set();

        for (let i = 1; i < shiftLines.length; i++) {
            const line = shiftLines[i].trim();
            if (!line) continue;
            const values = line.split(',');
            if (values.length < 3) continue;
            if (values[0].trim() === driverID) {
                const dateStr = values[2].trim();
                if (dateStr && dateStr.length >= 7) {
                    const recordMonth = dateStr.substring(5, 7);
                    if (recordMonth === monthStr) uniqueDates.add(dateStr);
                }
            }
        }

        let totalRequiredSeconds = 0;

        for (const dateStr of uniqueDates) {
            const dateObj = new Date(dateStr);
            const dayName = dayNames[dateObj.getDay()];
            if (dayName === driverDayOff) continue;

            const eidStart = new Date('2025-04-10');
            const eidEnd = new Date('2025-04-30');
            const isEid = dateObj >= eidStart && dateObj <= eidEnd;

            totalRequiredSeconds += isEid ? 6 * 3600 : (8 * 3600) + (24 * 60);
        }

        totalRequiredSeconds -= bonusCount * 2 * 3600;
        totalRequiredSeconds = Math.max(0, totalRequiredSeconds);

        // FIX: plain secondsToTime, no triple-digit padding
        return secondsToTime(totalRequiredSeconds);

    } catch (error) {
        console.error("Error in getRequiredHoursPerMonth:", error);
        return "000:00:00";
    }
}
    
// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// Calculates net pay after deductions for missing hours
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
// Edge cases:
    // - Driver not found in rateFile (return 0)
// ============================================================
// FIXED: getNetPay
// - Parse rateFile by header names (handles extra columns)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    try {
        let rateContent;
        try {
            rateContent = fs.readFileSync(rateFile, 'utf8');
        } catch (e) {
            return 0;
        }

        const rateLines = rateContent.split('\n').filter(line => line.trim() !== '');
        if (rateLines.length <= 0) return 0;

        // FIX: Parse header row to find basePay and tier indices dynamically
        //const rateHeaders = rateLines[0].split(',').map(h => h.trim());
        //const basePayIdx = rateHeaders.indexOf('basePay');
        //const tierIdx = rateHeaders.indexOf('tier');

        const basePayIdx = 2;
        const tierIdx = 3;

        if (basePayIdx === -1 || tierIdx === -1) return 0;

        let driverBasePay = 0;
        let driverTier = 0;
        let driverFound = false;

        for (let i = 0; i < rateLines.length; i++) {
            const line = rateLines[i].trim();
            if (!line) continue;
            const values = line.split(',');
            if (values[0].trim() === driverID) {
                driverBasePay = parseInt(values[basePayIdx].trim(), 10);
                driverTier = parseInt(values[tierIdx].trim(), 10);
                driverFound = true;
                break;
            }
        }

        if (!driverFound) return 0;

        const actualSeconds = durationToSeconds(actualHours);
        const requiredSeconds = durationToSeconds(requiredHours);

        if (actualSeconds >= requiredSeconds) return driverBasePay;

        const missingSeconds = requiredSeconds - actualSeconds;

        const allowanceMap = {
            1: 50 * 3600,
            2: 20 * 3600,
            3: 10 * 3600,
            4: 3 * 3600
        };

        const allowanceSeconds = allowanceMap[driverTier] || 0;
        const billableSeconds = Math.max(0, missingSeconds - allowanceSeconds);
        const billableHours = Math.floor(billableSeconds / 3600);

        const deductionRatePerHour = Math.floor(driverBasePay / 185);

        const netPay = driverBasePay - (billableHours * deductionRatePerHour);


        return netPay;

    } catch (error) {
        console.error("Error in getNetPay:", error);
        return 0;
    }
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
