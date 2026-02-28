/**
 * Returns true if the current time in the user's timezone falls within their quiet hours.
 * Format for start/end is "HH:MM" (24-hour).
 */
export function isQuietHours(startStr: string, endStr: string, timezone: string): boolean {
    if (!startStr || !endStr || !timezone) return false;

    try {
        // Current time in the specified timezone
        const now = new Date();
        const tzString = now.toLocaleString("en-US", { timeZone: timezone, hour12: false, hour: "numeric", minute: "numeric" });
        const [currentHourStr, currentMinuteStr] = tzString.split(":");

        // Convert to canonical minutes since midnight
        const currentMins = parseInt(currentHourStr, 10) * 60 + parseInt(currentMinuteStr, 10);

        const [startH, startM] = startStr.split(":").map(Number);
        const startMins = startH * 60 + startM;

        const [endH, endM] = endStr.split(":").map(Number);
        const endMins = endH * 60 + endM;

        // Crosses midnight (e.g., 22:00 to 07:00)
        if (startMins > endMins) {
            if (currentMins >= startMins || currentMins < endMins) {
                return true;
            }
        } else {
            // Normal range (e.g., 09:00 to 17:00)
            if (currentMins >= startMins && currentMins < endMins) {
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error("isQuietHours error:", error);
        return false;
    }
}

/**
 * Normalizes a time string (e.g. "10:00 PM", "7:00 AM", "22:00") or Date to a 24-hour "HH:MM" format.
 * 
 * @param input The time string or Date object to normalize
 * @returns A string in "HH:MM" 24-hour format, or null if invalid
 */
export function normalizeTo24HourHHMM(input: string | Date | null | undefined): string | null {
    if (!input) return null;

    if (input instanceof Date) {
        if (isNaN(input.getTime())) return null;
        const hours = input.getHours().toString().padStart(2, "0");
        const minutes = input.getMinutes().toString().padStart(2, "0");
        return `${hours}:${minutes}`;
    }

    const str = input.trim();

    // Already in "HH:MM" 24-hour format?
    if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(str)) {
        return str;
    }

    // Parse AM/PM format
    const amPmRegex = /^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/i;
    const match = str.match(amPmRegex);

    if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = match[2];
        const period = match[3].toUpperCase();

        if (hours < 1 || hours > 12) return null;

        if (period === "AM" && hours === 12) {
            hours = 0;
        } else if (period === "PM" && hours < 12) {
            hours += 12;
        }

        return `${hours.toString().padStart(2, "0")}:${minutes}`;
    }

    return null;
}

/**
 * Formats a 24-hour "HH:MM" string to a 12-hour "h:mm AM/PM" format.
 * 
 * @param hhmm The 24-hour time string
 * @returns A string in "h:mm AM/PM" format, or the original string if invalid
 */
export function formatTo12HourDisplay(hhmm: string | null | undefined): string {
    if (!hhmm) return "";

    const str = hhmm.trim();

    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(str)) {
        return str;
    }

    const [hoursStr, minutesStr] = str.split(":");
    let hours = parseInt(hoursStr, 10);
    const period = hours >= 12 ? "PM" : "AM";

    if (hours === 0) {
        hours = 12;
    } else if (hours > 12) {
        hours -= 12;
    }

    return `${hours}:${minutesStr} ${period}`;
}
