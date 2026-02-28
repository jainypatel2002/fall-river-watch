import { normalizeTo24HourHHMM, formatTo12HourDisplay } from './quietHours';

function test() {
    const tests = [
        { input: "10:00 PM", expected: "22:00" },
        { input: "12:00 AM", expected: "00:00" },
        { input: "12:00 PM", expected: "12:00" },
        { input: "7:05 am", expected: "07:05" },
        { input: "07:00", expected: "07:00" },
        { input: "23:59", expected: "23:59" },
        { input: "12:30 PM", expected: "12:30" }
    ];

    let passed = true;
    for (const { input, expected } of tests) {
        const result = normalizeTo24HourHHMM(input);
        if (result !== expected) {
            console.error(`❌ FAIL: '${input}' -> expected '${expected}', got '${result}'`);
            passed = false;
        } else {
            console.log(`✅ PASS: '${input}' -> '${result}'`);
        }
    }

    const formatTests = [
        { input: "22:00", expected: "10:00 PM" },
        { input: "00:00", expected: "12:00 AM" },
        { input: "12:00", expected: "12:00 PM" },
        { input: "07:05", expected: "7:05 AM" }
    ];

    for (const { input, expected } of formatTests) {
        const result = formatTo12HourDisplay(input);
        if (result !== expected) {
            console.error(`❌ FAIL format: '${input}' -> expected '${expected}', got '${result}'`);
            passed = false;
        } else {
            console.log(`✅ PASS format: '${input}' -> '${result}'`);
        }
    }

    if (passed) {
        console.log("All tests passed!");
        process.exit(0);
    } else {
        process.exit(1);
    }
}

test();
