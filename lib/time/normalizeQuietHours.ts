export function normalizeTo24HourHHMM(input: string): string | null {
    if (!input) return null;

    // If already valid 24-hour format
    if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(input)) {
        return input;
    }

    const match = input.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
    if (!match) return null;

    let [, hourStr, minute, period] = match;
    let hour = parseInt(hourStr, 10);

    if (period.toUpperCase() === "PM" && hour !== 12) {
        hour += 12;
    }
    if (period.toUpperCase() === "AM" && hour === 12) {
        hour = 0;
    }

    return `${hour.toString().padStart(2, "0")}:${minute}`;
}

export function formatTo12HourDisplay(hhmm: string): string {
    if (!hhmm) return "";
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(hhmm)) return hhmm;

    const [hourStr, minute] = hhmm.split(":");
    let hour = parseInt(hourStr, 10);
    const period = hour >= 12 ? "PM" : "AM";

    hour = hour % 12;
    if (hour === 0) hour = 12;

    return `${hour}:${minute} ${period}`;
}
