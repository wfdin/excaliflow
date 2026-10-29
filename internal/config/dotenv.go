package config

import (
	"bufio"
	"os"
	"strings"
)

// loadDotEnv reads KEY=VALUE pairs from a .env file and loads them into the
// process environment. Variables that already exist in the real environment
// are never overwritten, so shell/OS settings always take precedence over the
// file. A missing file is not an error.
func loadDotEnv(path string) (bool, error) {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	firstLine := true
	for scanner.Scan() {
		line := scanner.Text()
		if firstLine {
			// Strip a UTF-8 BOM if the file was saved by an editor that adds one.
			line = strings.TrimPrefix(line, "\uFEFF")
			firstLine = false
		}

		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		line = strings.TrimPrefix(line, "export ")
		key, rawValue, found := strings.Cut(line, "=")
		if !found {
			continue
		}

		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}

		if err := os.Setenv(key, parseDotEnvValue(rawValue)); err != nil {
			return true, err
		}
	}

	return true, scanner.Err()
}

// parseDotEnvValue trims surrounding spaces, unwraps matching quotes, and
// expands the common \n, \t, \" and \\ escapes inside double-quoted values.
func parseDotEnvValue(raw string) string {
	value := strings.TrimSpace(raw)
	if len(value) < 2 {
		return value
	}

	quote := value[0]
	if (quote != '"' && quote != '\'') || value[len(value)-1] != quote {
		return value
	}

	value = value[1 : len(value)-1]
	if quote == '"' {
		value = strings.NewReplacer(
			`\n`, "\n",
			`\t`, "\t",
			`\"`, `"`,
			`\\`, `\`,
		).Replace(value)
	}
	return value
}
