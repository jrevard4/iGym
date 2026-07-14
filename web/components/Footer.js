export default function Footer() {
  return (
    <footer className="mt-24 border-t border-gray-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10 grid sm:grid-cols-3 gap-8 text-sm">
        <div>
          <div className="text-xl font-black mb-2">
            <span className="text-brand">i</span>Gym
          </div>
          <p className="text-gray-600 leading-relaxed">
            Finding the right gym, for you.
          </p>
        </div>

        <div>
          <div className="font-semibold mb-3 text-gray-900">For Members</div>
          <ul className="space-y-2 text-gray-600">
            <li><a href="/gyms" className="hover:text-brand">Browse Gyms</a></li>
            <li><a href="/register" className="hover:text-brand">Create Account</a></li>
            <li><a href="/wallet" className="hover:text-brand">Your Wallet</a></li>
          </ul>
        </div>

        <div>
          <div className="font-semibold mb-3 text-gray-900">For Gym Owners</div>
          <ul className="space-y-2 text-gray-600">
            <li><a href="/owner/login" className="hover:text-brand">Owner Portal →</a></li>
            <li>AI photo tools still live in the iGym mobile app</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-gray-100 py-5 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} iGym. All rights reserved.
      </div>
    </footer>
  );
}
