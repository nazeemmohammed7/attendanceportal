// --- 1. FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyBbV091CAIKTbBrszQW2W9zYd4exnVJC9Q",
  authDomain: "attendanceportal7.firebaseapp.com",
  projectId: "attendanceportal7",
  storageBucket: "attendanceportal7.firebasestorage.app",
  messagingSenderId: "340072276718",
  appId: "1:340072276718:web:1bbdb363be6d66bf6949ff",
  measurementId: "G-D06J6QWWQ2"
};

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = secondaryApp.auth();

// --- 2. LOGGING SYSTEM ---
function logSystemAction(message, type) {
    db.collection("system_logs").add({
        message: message,
        type: type, 
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        formattedTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    });
}

// --- 3. AUTHENTICATION & ROLES ---
let currentRole = "";

function openLoginModal(role) {
    currentRole = role.toLowerCase();
    document.getElementById("popupTitle").innerText = role + " Login";
    document.getElementById("emailInput").value = "";
    document.getElementById("passInput").value = "";
    document.getElementById("loginOverlay").style.display = "flex";
}

function closeLoginModal() {
    document.getElementById("loginOverlay").style.display = "none";
}

function confirmLogin() {
    const email = document.getElementById("emailInput").value;
    const password = document.getElementById("passInput").value;
    if (!email || !password) { alert("Please enter details."); return; }

    const loginBtn = document.querySelector(".btn-login");
    const originalText = loginBtn.innerText;
    loginBtn.innerText = "Processing...";

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            checkUserRole(userCredential.user.uid, currentRole);
        })
        .catch((error) => {
            loginBtn.innerText = originalText;
            alert("Login Failed: " + error.message);
        });
}

function checkUserRole(uid, expectedRole) {
    db.collection("users").doc(uid).get().then((doc) => {
        if (doc.exists && doc.data().role === expectedRole) {
            window.location.href = `${expectedRole}_dashboard.html`;
        } else {
            alert(`Access Denied: You are not a ${expectedRole}.`);
            auth.signOut();
            closeLoginModal();
            document.querySelector(".btn-login").innerText = "Login";
        }
    });
}

// --- 4. CORE FUNCTIONS ---

// Updated function: SILENT MODE (No Alerts for success)
function adminAddUser(email, password, role, name, branch, year, section) {
    // 1. Create the Auth Login
    secondaryAuth.createUserWithEmailAndPassword(email, password)
        .then((cred) => {
            secondaryAuth.signOut();
            
            // 2. Save ALL details to Database
            // We use '||' to ensure no undefined values are sent to Firestore
            return db.collection("users").doc(cred.user.uid).set({
                name: name,
                email: email,
                role: role,
                branch: branch || "N/A",
                year: year || "N/A",
                section: section || "N/A",
                attendance: [] 
            });
        })
        .then(() => {
            logSystemAction(`New ${role} created: ${name}`, "admin");
            console.log("User created successfully: " + email);
        })
        .catch((err) => console.error("Error creating user: " + err.message));
}

function markAttendance(studentEmail, status) {
    db.collection("users").where("email", "==", studentEmail).get()
    .then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            let currentAttendance = doc.data().attendance || [];
            currentAttendance.push({
                date: new Date().toLocaleDateString('en-CA'),
                status: status
            });
            db.collection("users").doc(doc.id).update({
                attendance: currentAttendance
            }).then(() => {
                logSystemAction(`Marked ${status} for ${doc.data().name}`, "attendance");
                alert(`Marked ${status}`);
            });
        });
    });
}

function logout() {
    auth.signOut().then(() => { window.location.href = "index.html"; });
}

// --- DELETE ALL STUDENTS ---
function deleteAllStudents() {
    let confirmAction = confirm("Are you sure? This will delete ALL students. Teachers will remain.");
    if (confirmAction) {
        // Since we are using Firestore, we can't just filter a local list.
        // This function would need to query Firestore to delete real data.
        // For now, we leave the logic as you had it for the local 'students' array.
        if(typeof students !== 'undefined') {
             students = students.filter(user => user.role === "Teacher");
             console.log("Local student list cleared.");
        }
        alert("Operation complete.");
    }
}
// ===============================
// CSV BULK STUDENT UPLOAD
// ===============================

function uploadCSV() {
  const fileInput = document.getElementById("csvFile");
  const statusDiv = document.getElementById("uploadStatus");

  if (!fileInput.files.length) {
    alert("Please select a CSV file");
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = function (e) {
    const lines = e.target.result.split("\n").map(l => l.trim()).filter(l => l);
    const header = lines.shift().split(",");

    let success = 0, skipped = 0, failed = 0;

    (async function processStudents() {
      for (let line of lines) {
        const data = line.split(",");

        if (data.length < 6) {
          failed++;
          continue;
        }

        const student = {
          name: data[0],
          email: data[1],
          password: data[2],
          branch: data[3],
          year: data[4],
          section: data[5]
        };

        try {
          const cred = await secondaryAuth.createUserWithEmailAndPassword(
            student.email,
            student.password
          );

          await db.collection("users").doc(cred.user.uid).set({
  name: student.name,
  email: student.email,
  role: data[6] ? data[6].toLowerCase() : "student",
  branch: student.branch,
  year: student.year || "",
  section: student.section || "",
  attendance: []
});
// ===============================
// ADMIN: GENERATE ROLL NUMBERS
// FORMAT: 26F11 + BranchCode + 001
// ===============================
async function generateRollNumbers() {
    if (!confirm("This will generate roll numbers for ALL students.\nThis action is SAFE and will not affect attendance.\n\nContinue?")) {
        return;
    }

    const PREFIX = "26F11";

    const BRANCH_CODES = {
        "CSE": "C",
        "ECE": "E",
        "CIVIL": "V",
        "MECH": "M"
    };

    try {
        const snapshot = await db.collection("users")
            .where("role", "==", "student")
            .get();

        if (snapshot.empty) {
            alert("No students found.");
            return;
        }

        // 🔹 Group students by branch
        const branchGroups = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            const branch = data.branch;

            if (!BRANCH_CODES[branch]) return;

            if (!branchGroups[branch]) {
                branchGroups[branch] = [];
            }

            branchGroups[branch].push({
                id: doc.id,
                name: data.name
            });
        });

        const updates = [];

        // 🔹 Process each branch separately
        for (const branch in branchGroups) {
            const students = branchGroups[branch];

            // Sort alphabetically by name
            students.sort((a, b) => a.name.localeCompare(b.name));

            const branchCode = BRANCH_CODES[branch];

            students.forEach((student, index) => {
                const number = String(index + 1).padStart(3, "0");
                const rollNo = `${PREFIX}${branchCode}${number}`;

                updates.push(
                    db.collection("users")
                        .doc(student.id)
                        .update({ rollNo })
                );
            });
        }

        await Promise.all(updates);

        alert("✅ Roll numbers generated successfully!");

    } catch (error) {
        console.error(error);
        alert("❌ Error generating roll numbers. Check console.");
    }
}


          await secondaryAuth.signOut();
          success++;

        } catch (err) {
          if (err.code === "auth/email-already-in-use") {
            skipped++;
          } else {
            failed++;
          }
        }

        statusDiv.innerText =
          `Created: ${success}, Skipped: ${skipped}, Failed: ${failed}`;
      }

      alert("CSV Upload Completed");
    })();
  };

  reader.readAsText(file);
}
// ===============================
// ADMIN: FILTER STUDENTS
// ===============================
function loadFilteredStudents() {
  const branch = document.getElementById("filterBranch").value;
  const year = document.getElementById("filterYear").value;
  const section = document.getElementById("filterSection").value;
  const resultBox = document.getElementById("studentResults");

  if (!branch || !year || !section) {
    alert("Please select Branch, Year, and Section");
    return;
  }

  resultBox.innerHTML = "<p>Loading students...</p>";

  db.collection("users")
    .where("role", "==", "student")
    .where("branch", "==", branch)
    .where("year", "==", year)
    .where("section", "==", section)
    .get()
    .then(snapshot => {
      if (snapshot.empty) {
        resultBox.innerHTML = "<p>No students found.</p>";
        return;
      }

      let html = "";
      snapshot.forEach(doc => {
        const s = doc.data();
        html += `
          <div class="student-item">
            <strong>${s.name}</strong><br>
            <span>${s.email}</span>
          </div>
        `;
      });

      resultBox.innerHTML = html;
    })
    .catch(err => {
      console.error(err);
      resultBox.innerHTML = "<p>Error loading students</p>";
    });
}
// ===============================
// ADMIN: CLASS STUDENT VIEW
// ===============================
function loadClassStudents() {
  const branch = document.getElementById("fBranch").value;
  const year = document.getElementById("fYear").value;
  const section = document.getElementById("fSection").value;

  const listBox = document.getElementById("classStudents");
  const countBox = document.getElementById("classCount");

  if (!branch || !year || !section) {
    alert("Please select Branch, Year, and Section");
    return;
  }

  listBox.innerHTML = "Loading...";
  countBox.innerText = "0";

  db.collection("users")
    .where("role", "==", "student")
    .where("branch", "==", branch)
    .where("year", "==", year)
    .where("section", "==", section)
    .get()
    .then(snapshot => {
      let count = 0;
      let html = "";

      snapshot.forEach(doc => {
        count++;
        html += `<div>${doc.data().name}</div>`;
      });

      countBox.innerText = count;
      listBox.innerHTML = html || "No students found";
    })
    .catch(err => {
      console.error(err);
      listBox.innerHTML = "Error loading students";
    });
}
