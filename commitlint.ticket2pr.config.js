module.exports = {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "ticket2pr-header": ({ header }) => {
          const pattern = /^(fix|feat|chore): CU-[a-zA-Z0-9]+ - .+$/;

          return [
            pattern.test(header),
            "header must match '<fix|feat|chore>: CU-<taskid> - <commit message>'",
          ];
        },
      },
    },
  ],
  rules: {
    "subject-case": [0],
    "body-max-line-length": [2, "always", 200],
    "type-enum": [2, "always", ["feat", "fix", "chore"]],
    "scope-empty": [2, "always"],
    "ticket2pr-header": [2, "always"],
  },
};
