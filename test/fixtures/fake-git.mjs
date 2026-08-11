const mode = process.argv[2] ?? "success";

if (mode === "timeout") {
  setTimeout(() => process.exit(0), 10_000);
} else if (mode === "overflow") {
  process.stdout.write("x".repeat(4096));
} else if (mode === "failure") {
  process.stderr.write("secret raw git diagnostic");
  process.exitCode = 7;
} else if (mode === "dirty") {
  process.stdout.write(" M changed-file\0");
  setTimeout(() => process.exit(0), 10_000);
} else if (mode === "clean") {
  process.exitCode = 0;
} else {
  process.stdout.write("ok\n");
}
