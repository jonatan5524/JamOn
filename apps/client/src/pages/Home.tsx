import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Music, Users, Sparkles, ArrowRight } from "lucide-react";
import ParticleBackground from "@/components/layout/ParticleBackground";
import TopNav from "@/components/layout/TopNav";
import JoinEventDialog from "@/components/events/JoinEventDialog";
import CreateEventDialog from "@/components/events/CreateEventDialog";

const Home = () => {
  const navigate = useNavigate();
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const handleNewEvent = () => setCreateOpen(true);
  const handleJoinEvent = () => setJoinOpen(true);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0E17] text-white flex flex-col">
      <ParticleBackground />
      
      <div className="absolute top-[-5%] left-[-5%] w-[450px] h-[450px] bg-[#2DE2A5]/10 rounded-full blur-[100px] pointer-events-none z-0" />
      <div className="absolute top-[15%] right-[-5%] w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none z-0" />

      <div className="relative z-10 flex flex-col flex-1 h-full">

        <TopNav
          showBack={false}
          onNewEvent={handleNewEvent}
          onJoinEvent={handleJoinEvent}
        />

        <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-6 pb-12 text-center flex flex-col items-center justify-center">
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="flex gap-1 mb-4 items-end h-4 select-none"
          >
            <div className="w-0.5 h-2.5 bg-[#2DE2A5] rounded-full animate-pulse" />
            <div className="w-0.5 h-4 bg-[#2DE2A5] rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
            <div className="w-0.5 h-3 bg-[#2DE2A5] rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
            <div className="w-0.5 h-1.5 bg-[#2DE2A5] rounded-full animate-pulse" style={{ animationDelay: '450ms' }} />
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-[1.2] max-w-3xl"
          >
            Create the <span className="text-[#2DE2A5] drop-shadow-[0_0_20px_rgba(45,226,165,0.15)]">Perfect Playlist</span> <br />
            for Every Moment
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
            className="mt-4 text-gray-400 max-w-xl text-sm sm:text-base leading-relaxed font-normal"
          >
            Combine your group's music taste with AI to generate playlists that everyone will love. 
            Perfect for parties, road trips, or any gathering.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
            className="mt-6 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto"
          >
            <button 
              onClick={handleNewEvent}
              className="flex items-center justify-center gap-2 bg-[#2DE2A5] hover:bg-[#25C893] text-black px-6 py-2.5 rounded-xl font-bold transition-all hover:scale-[1.01] active:scale-[0.99] w-full sm:w-auto shadow-md cursor-pointer text-xs"
            >
              Create Event <ArrowRight size={14} />
            </button>
            <button 
              onClick={handleJoinEvent}
              className="bg-[#131823] hover:bg-[#1A202D] text-white px-6 py-2.5 rounded-xl font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] border border-gray-800/80 w-full sm:w-auto cursor-pointer text-xs"
            >
              Join with Code
            </button>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            className="w-full mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto text-left"
          >

            <div className="bg-[#12161F]/50 backdrop-blur-md p-5 rounded-xl border border-gray-800/50 hover:border-[#2DE2A5]/20 transition-all group">
              <div className="w-8 h-8 rounded-lg bg-[#0A1A18] flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <Music className="text-[#2DE2A5]" size={16} />
              </div>
              <h3 className="text-base font-bold mb-1.5 tracking-wide">Event Vibe</h3>
              <p className="text-gray-400 text-xs leading-relaxed font-normal">
                Describe your event's atmosphere and let AI understand the perfect mood
              </p>
            </div>

            <div className="bg-[#12161F]/50 backdrop-blur-md p-5 rounded-xl border border-gray-800/50 hover:border-[#2DE2A5]/20 transition-all group">
              <div className="w-8 h-8 rounded-lg bg-[#0A1A18] flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <Users className="text-[#2DE2A5]" size={16} />
              </div>
              <h3 className="text-base font-bold mb-1.5 tracking-wide">Group Taste</h3>
              <p className="text-gray-400 text-xs leading-relaxed font-normal">
                Everyone's music preferences blend together seamlessly
              </p>
            </div>

            <div className="bg-[#12161F]/50 backdrop-blur-md p-5 rounded-xl border border-gray-800/50 hover:border-[#2DE2A5]/20 transition-all group">
              <div className="w-8 h-8 rounded-lg bg-[#0A1A18] flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <Sparkles className="text-[#2DE2A5]" size={16} />
              </div>
              <h3 className="text-base font-bold mb-1.5 tracking-wide">AI Magic</h3>
              <p className="text-gray-400 text-xs leading-relaxed font-normal">
                Smart algorithms find songs at the intersection of all tastes
              </p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="w-full max-w-4xl mx-auto text-center mt-8"
          >
            <h2 className="text-xl sm:text-2xl font-bold mb-8 tracking-wide">
              How It <span className="text-[#D946EF] drop-shadow-[0_0_15px_rgba(217,70,239,0.15)]">Works</span>
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { step: "01", title: "Create", desc: "Set up your event vibe" },
                { step: "02", title: "Share", desc: "Invite via QR code" },
                { step: "03", title: "Mix", desc: "AI analyzes tastes" },
                { step: "04", title: "Play", desc: "Enjoy your playlist" },
              ].map((item, idx) => (
                <div key={idx} className="flex flex-col items-center group">
                  <span className="text-2xl font-extrabold text-[#144338] mb-1.5 tracking-wider group-hover:text-[#1d5c4e] transition-colors select-none">
                    {item.step}
                  </span>
                  <h4 className="font-bold text-sm mb-0.5 tracking-wide text-gray-200">
                    {item.title}
                  </h4>
                  <p className="text-gray-500 text-[11px] font-normal">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

        </main>
      </div>

      <JoinEventDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
      <CreateEventDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
};

export default Home;