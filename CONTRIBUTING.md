# Contributing to Panel Chat Bot

Thank you for your interest in contributing to **Panel Chat Bot**! As an open-source project, we welcome improvements, bug reports, documentation enhancements, and feature requests.

---

## 📜 Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free experience for everyone. Please be respectful and collaborative in all discussions and pull requests.

---

## 🛠️ How to Contribute

### Reporting Bugs
- Check the [Issues tab](https://github.com/grownex-ventures/panel-chat-bot/issues) first to see if the issue has already been reported.
- If not, open a new issue with a clear description, reproduction steps, expected behavior, and environment details (Node version, OS).

### Proposing New Features
- Open an issue with the tag `enhancement` describing the proposed feature, use case, and architectural approach before implementing large changes.

### Submitting Pull Requests

1. **Fork the repository** on GitHub.
2. **Clone your fork**:
   ```bash
   git clone https://github.com/<your-username>/panel-chat-bot.git
   cd panel-chat-bot
   ```
3. **Create a branch**:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bugfix-name
   ```
4. **Install dependencies**:
   ```bash
   npm install
   ```
5. **Make your changes**:
   - Follow existing code style (clean ES Modules, meaningful variable names).
   - Never commit sensitive keys, passwords, or personal credentials.
   - Ensure all tests pass.
6. **Run tests**:
   ```bash
   npm test
   ```
7. **Commit using Conventional Commits**:
   - `feat: add new payment gateway status check`
   - `fix: resolve order quantity edge case`
   - `docs: update setup instructions in README`
   - `test: add unit test for card formatting`
8. **Push to your fork**:
   ```bash
   git push origin feat/your-feature-name
   ```
9. **Open a Pull Request** against the `main` branch of `grownex-ventures/panel-chat-bot`.

---

## 🧪 Testing Guidelines

Any new functionality or bug fixes must include corresponding tests in the `tests/` directory. All tests run using Node.js's native test runner:

```bash
npm test
```

---

## 🔒 Security Vulnerabilities

If you discover a security vulnerability, please do NOT open a public issue. Contact the maintainers directly or use GitHub's private vulnerability reporting feature.
