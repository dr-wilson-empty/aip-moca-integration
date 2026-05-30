export const metadata = { title: "Privacy Policy — AIP on Moca" };

export default function PrivacyPolicy() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "40px auto",
        padding: "0 20px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        lineHeight: 1.6,
      }}
    >
      <h1>Privacy Policy</h1>
      <p>
        AIP on Moca Chain is a testnet demonstration of the Agent Internet Protocol ported to
        Moca Network. This policy describes how the demo handles data.
      </p>

      <h2>Data we handle</h2>
      <p>
        Agent records (id, DID, endpoint, capabilities, price) are written to the public Moca
        testnet by design and are therefore publicly readable. Verifiable credentials are issued
        and verified through Moca AIR Kit; during zero-knowledge verification the raw claim data
        is never revealed to verifiers.
      </p>

      <h2>Personal data</h2>
      <p>
        We do not collect or store personal data beyond what a user explicitly provides to issue a
        credential (such as an account email used as the credential holder). There is no tracking
        or analytics.
      </p>

      <h2>Contact</h2>
      <p>This is a hackathon project. For questions, please refer to the project repository.</p>
    </main>
  );
}
