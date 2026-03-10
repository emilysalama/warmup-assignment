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
        
        const lines = content.split('\n').filter(line => line.trim() !== '');
        if (lines.length <= 1) return;
     
        const headers = lines[0].split(',');
        
        // Find the hasBonus column index
        const bonusIndex = headers.findIndex(h => h.trim() === 'hasBonus');
        if (bonusIndex === -1) return;
        
        // Find and update the matching record
        let updated = false;
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i] || lines[i].trim() === '') continue;
            
            const values = lines[i].split(',');
            if (values.length < 3) continue;
            
            const currentDriverID = values[0].trim();
            const currentDate = values[2] ? values[2].trim() : '';
            
            if (currentDriverID === driverID && currentDate === date) {
                values[bonusIndex] = newValue ? 'true' : 'false';
                lines[i] = values.join(',');
                updated = true;
                break;
            }
        }
        
        // If updated, write back to file
        if (updated) {
            fs.writeFileSync(textFile, lines.join('\n'));
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
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    // Edge cases:
    // - Month can be "4" or "04"
    // - Driver not found (return -1)
    // - No records for that month (return 0)

    try {
        // Read the file
        let content = fs.readFileSync(textFile, 'utf8');
        const lines = content.trim().split('\n');
        
        if (lines.length <= 1) {
            return -1;
        }
        
        // Get headers
        const headers = lines[0].split(',');
        
        // Normalize month input (pad with leading zero if needed)
        const monthStr = month.toString().padStart(2, '0');
        
        let driverFound = false;
        let bonusCount = 0;
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i] || lines[i].trim() === '') continue;
            
            const record = parseCSVLine(lines[i], headers);
            
            if (record.driverID === driverID) {
                driverFound = true;
                
                // Extract month from date (yyyy-mm-dd)
                const recordMonth = record.date.substring(5, 7);
                
                if (recordMonth === monthStr && record.hasBonus === true) {
                    bonusCount++;
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
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    // Edge cases:
    // - No records for that driver/month (return "000:00:00")
    
    try {
        // Read the file
        let content = fs.readFileSync(textFile, 'utf8');
        const lines = content.trim().split('\n');
        
        if (lines.length <= 1) {
            return "000:00:00";
        }
        
        // Get headers
        const headers = lines[0].split(',');
        
        // Find activeTime column index
        const activeTimeIndex = headers.findIndex(h => h.trim() === 'activeTime');
        
        // Format month for comparison
        const monthStr = month.toString().padStart(2, '0');
        
        let totalSeconds = 0;
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i] || lines[i].trim() === '') continue;
            
            const values = lines[i].split(',');
            
            // Check if this is the driver we want
            if (values[0].trim() === driverID) {
                // Extract month from date (date is at index 2)
                const recordMonth = values[2].substring(5, 7);
                
                if (recordMonth === monthStr) {
                    // Add activeTime to total (activeTime is at activeTimeIndex)
                    const activeTime = values[activeTimeIndex].trim();
                    totalSeconds += durationToSeconds(activeTime);
                }
            }
        }
        
        // Return in hhh:mm:ss format
        return secondsToTime(totalSeconds, true);
        
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
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    try {
        // First, read rateFile to get driver's day off
        const rateContent = fs.readFileSync(rateFile, 'utf8');
        const rateLines = rateContent.trim().split('\n');
        
        if (rateLines.length <= 1) {
            return "000:00:00";
        }
        
        const rateHeaders = rateLines[0].split(',');
        let driverDayOff = null;
        
        // Find driver in rate file
        for (let i = 1; i < rateLines.length; i++) {
            if (!rateLines[i] || rateLines[i].trim() === '') continue;
            
            const values = rateLines[i].split(',');
            if (values[0].trim() === driverID) {
                driverDayOff = values[1].trim(); // dayOff is at index 1
                break;
            }
        }
        
        if (!driverDayOff) {
            return "000:00:00";
        }
        
        // Now read shifts file to get all dates for this driver/month
        const shiftContent = fs.readFileSync(textFile, 'utf8');
        const shiftLines = shiftContent.trim().split('\n');
        
        if (shiftLines.length <= 1) {
            return "000:00:00";
        }
        
        const shiftHeaders = shiftLines[0].split(',');
        
        // Format month for comparison
        const monthStr = month.toString().padStart(2, '0');
        
        // Get all unique dates for this driver/month
        const dates = [];
        
        for (let i = 1; i < shiftLines.length; i++) {
            if (!shiftLines[i] || shiftLines[i].trim() === '') continue;
            
            const values = shiftLines[i].split(',');
            if (values[0].trim() === driverID) {
                const recordDate = values[2].trim(); // date at index 2
                const recordMonth = recordDate.substring(5, 7);
                
                if (recordMonth === monthStr) {
                    dates.push(recordDate);
                }
            }
        }
        
        // Remove duplicates
        const uniqueDates = [...new Set(dates)];
        
        // Calculate required hours for each date
        let totalRequiredSeconds = 0;
        
        // Day names mapping
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        
        for (const dateStr of uniqueDates) {
            // Check if this date is the driver's day off
            const dateObj = new Date(dateStr);
            const dayName = dayNames[dateObj.getDay()];
            
            if (dayName === driverDayOff) {
                continue;
            }
            
            // Check if date is in Eid period
            const eidStart = new Date('2025-04-10');
            const eidEnd = new Date('2025-04-30');
            const isEid = dateObj >= eidStart && dateObj <= eidEnd;

            if (isEid) {
                totalRequiredSeconds += 6 * 3600;
            } else {
                totalRequiredSeconds += (8 * 3600) + (24 * 60);
            }
        }

        // Subtract bonus hours (2 hours per bonus)
        totalRequiredSeconds -= (bonusCount * 2 * 3600);

        totalRequiredSeconds = Math.max(0, totalRequiredSeconds);

        return secondsToTime(totalRequiredSeconds, true);
        
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
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    // Edge cases:
    // - Driver not found in rateFile (return 0)
    // - Actual hours >= required hours (no deduction)

    try {
        // Read rateFile to get driver's tier and basePay
        const rateContent = fs.readFileSync(rateFile, 'utf8');
        const rateLines = rateContent.trim().split('\n');
        
        if (rateLines.length <= 1) {
            return 0;
          }
    
        // Find driver in rate file
        let driverTier = null;
        let driverBasePay = null;
        
        for (let i = 1; i < rateLines.length; i++) {
            if (!rateLines[i] || rateLines[i].trim() === '') continue;
            
            const values = rateLines[i].split(',');
            if (values[0].trim() === driverID) {
                driverTier = parseInt(values[3].trim(), 10);
                driverBasePay = parseInt(values[2].trim(), 10);
                break;
            }
        }
        
        if (!driverTier || !driverBasePay) {
            return 0;
        }
        
        // Convert hours to seconds
        const actualSeconds = durationToSeconds(actualHours);
        const requiredSeconds = durationToSeconds(requiredHours);
        
        // If actual >= required, no deduction
        if (actualSeconds >= requiredSeconds) {
            return driverBasePay;
        }
        
        // Calculate missing seconds
        let missingSeconds = requiredSeconds - actualSeconds;
        
        // Tier allowances
        const allowanceHours = {
            1: 50,
            2: 20,
            3: 10,
            4: 3
        };
        
        const allowanceSeconds = allowanceHours[driverTier] * 3600;
        
        // Calculate billable seconds after allowance
        let billableSeconds = Math.max(0, missingSeconds - allowanceSeconds);
        
        // Convert to full hours only (floor)
        const billableHours = Math.floor(billableSeconds / 3600);
        
        // Calculate deduction rate
        const deductionRatePerHour = Math.floor(driverBasePay / 185);
    
        // Calculate net pay
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
